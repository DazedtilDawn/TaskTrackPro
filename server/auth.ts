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
  // For blank passwords, store a special hash that can't be bruteforced
  if (!password) {
    return 'BLANK';
  }
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  // Handle blank password case
  if (stored === 'BLANK' && !supplied) {
    return true;
  }
  if (stored === 'BLANK' || !supplied) {
    return false;
  }
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

async function getUserByUsername(username: string) {
  try {
    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return user;
  } catch (error) {
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
        const user = await getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        }
        return done(null, user);
      } catch (error) {
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
        // Clear the session when user not found
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
      console.log("[Auth] Processing registration request");
      const result = insertUserSchema.safeParse(req.body);
      if (!result.success) {
        throw new ValidationError("Invalid registration data", fromZodError(result.error).toString());
      }

      const existingUser = await getUserByUsername(result.data.username);
      if (existingUser) {
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
      console.log("[Auth] Processing login request");
      const result = loginCredentialsSchema.safeParse(req.body);
      if (!result.success) {
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