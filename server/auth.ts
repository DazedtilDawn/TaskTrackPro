import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
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
    interface NextFunction {
      (err?: any): void;
    }
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
    return await db.select().from(users).where(eq(users.username, username)).limit(1);
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

  const validateLoginCredentials = async (req: Express.Request, res: Express.Response, next: Express.NextFunction) => {
    try {
      const result = loginCredentialsSchema.safeParse(req.body);
      if (!result.success) {
        throw new ValidationError("Invalid credentials format", fromZodError(result.error).toString());
      }
      next();
    } catch (error) {
      next(error);
    }
  };

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const [user] = await getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        }
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!user) {
        throw new AuthenticationError("User not found");
      }
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  app.post("/api/register", csrfProtection, async (req, res, next) => {
    try {
      const result = insertUserSchema.safeParse(req.body);
      if (!result.success) {
        throw new ValidationError("Invalid registration data", fromZodError(result.error).toString());
      }

      const [existingUser] = await getUserByUsername(result.data.username);
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

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(user);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", csrfProtection, validateLoginCredentials, (req, res, next) => {
    passport.authenticate("local", (err: any, user: Express.User | false, info: any) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return next(new AuthenticationError("Invalid credentials"));
      }
      req.logIn(user, (err) => {
        if (err) {
          return next(err);
        }
        return res.status(200).json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", csrfProtection, (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res, next) => {
    if (!req.isAuthenticated()) {
      return next(new AuthenticationError());
    }
    res.json(req.user);
  });
}