import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, insertUserSchema, loginCredentialsSchema, type SelectUser } from "@db/schema";
import { db, pool } from "@db";
import { eq } from "drizzle-orm";
import { fromZodError } from "zod-validation-error";
import csurf from "csurf";
import cookieParser from "cookie-parser";
import { AuthenticationError, ValidationError, DatabaseError } from "./lib/errors";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);
const PostgresSessionStore = connectPg(session);

async function hashPassword(password: string) {
  console.log("[Auth] Hashing password...");
  // For blank passwords, store a special hash that can't be bruteforced
  if (!password) {
    console.warn("[Auth] Warning: Attempting to hash empty password");
    return 'BLANK';
  }
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  const hashedPassword = `${buf.toString("hex")}.${salt}`;
  console.log("[Auth] Password hashed successfully");
  return hashedPassword;
}

async function comparePasswords(supplied: string, stored: string) {
  console.log("[Auth] Comparing passwords...");
  // Handle blank password case
  if (stored === 'BLANK' && !supplied) {
    console.warn("[Auth] Warning: Empty password comparison");
    return true;
  }
  if (stored === 'BLANK' || !supplied) {
    console.warn("[Auth] Warning: Invalid password comparison scenario");
    return false;
  }
  try {
    const [hashed, salt] = stored.split(".");
    const hashedBuf = Buffer.from(hashed, "hex");
    const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
    const match = timingSafeEqual(hashedBuf, suppliedBuf);
    console.log("[Auth] Password comparison result:", match);
    return match;
  } catch (error) {
    console.error("[Auth] Error comparing passwords:", error);
    return false;
  }
}

async function getUserByUsername(username: string) {
  console.log("[Auth] Looking up user by username:", username);
  try {
    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    console.log("[Auth] User lookup result:", user ? "Found" : "Not found");
    return user;
  } catch (error) {
    console.error("[Auth] Database error during user lookup:", error);
    throw new DatabaseError("Error fetching user", error);
  }
}

export function setupAuth(app: Express) {
  const store = new PostgresSessionStore({ pool, createTableIfMissing: true });
  const isProduction = app.get("env") === "production";

  // Ensure we have a proper session secret
  const sessionSecret = process.env.SESSION_SECRET || process.env.REPL_ID;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET or REPL_ID environment variable must be set");
  }

  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store,
    name: 'sid',
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    },
    proxy: isProduction
  };

  if (isProduction) {
    app.set("trust proxy", 1);
  }

  app.use(cookieParser());
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  const csrfProtection = csurf({
    cookie: {
      sameSite: 'strict',
      secure: isProduction
    }
  });

  app.get('/api/csrf-token', csrfProtection, (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
  });

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        console.log("[Auth] Starting authentication process for username:", username);
        const user = await getUserByUsername(username);

        if (!user) {
          console.log("[Auth] Authentication failed: User not found");
          return done(null, false);
        }

        const isValidPassword = await comparePasswords(password, user.password);
        if (!isValidPassword) {
          console.log("[Auth] Authentication failed: Invalid password");
          return done(null, false);
        }

        console.log("[Auth] Authentication successful for user:", user.id);
        return done(null, user);
      } catch (error) {
        console.error("[Auth] Authentication error:", error);
        return done(error);
      }
    })
  );

  passport.serializeUser((user, done) => {
    console.log("[Auth] Serializing user:", user.id);
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      console.log("[Auth] Attempting to deserialize user:", id);
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!user) {
        console.log("[Auth] User not found during deserialization:", id);
        return done(null, false);
      }

      console.log("[Auth] Successfully deserialized user:", id);
      done(null, user);
    } catch (error) {
      console.error("[Auth] Error during user deserialization:", error);
      done(error);
    }
  });

  app.post("/api/register", csrfProtection, async (req: Request, res, next) => {
    try {
      console.log("[Auth] Processing registration request:", req.body);
      const result = insertUserSchema.safeParse(req.body);
      if (!result.success) {
        console.log("[Auth] Registration validation failed:", result.error);
        throw new ValidationError("Invalid registration data", fromZodError(result.error).toString());
      }

      const existingUser = await getUserByUsername(result.data.username);
      if (existingUser) {
        console.log("[Auth] Registration failed: Username already exists");
        throw new ValidationError("Username already exists");
      }

      const [user] = await db
        .insert(users)
        .values({
          ...result.data,
          password: await hashPassword(result.data.password),
        })
        .returning();

      console.log("[Auth] User registered successfully:", user.id);
      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(user);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", csrfProtection, async (req: Request, res, next) => {
    try {
      console.log("[Auth] Processing login request. Body:", { 
        username: req.body.username,
        hasPassword: !!req.body.password 
      });

      const result = loginCredentialsSchema.safeParse(req.body);
      if (!result.success) {
        console.log("[Auth] Login validation failed:", result.error);
        throw new ValidationError("Invalid credentials format", fromZodError(result.error).toString());
      }

      passport.authenticate("local", (err: any, user: Express.User | false) => {
        if (err) {
          console.error("[Auth] Login error:", err);
          return next(err);
        }
        if (!user) {
          console.log("[Auth] Login failed: Invalid credentials");
          return next(new AuthenticationError("Invalid credentials"));
        }
        req.logIn(user, (err) => {
          if (err) {
            console.error("[Auth] Login error:", err);
            return next(err);
          }
          console.log("[Auth] User logged in successfully:", user.id);
          return res.json(user);
        });
      })(req, res, next);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/logout", csrfProtection, (req, res, next) => {
    console.log("[Auth] Processing logout request");
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res, next) => {
    if (!req.isAuthenticated()) {
      console.log("[Auth] Unauthorized access to /api/user");
      return next(new AuthenticationError());
    }
    console.log("[Auth] User data requested:", req.user!.id);
    res.json(req.user);
  });
}