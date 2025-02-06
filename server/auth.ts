import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { users, insertUserSchema, type SelectUser } from "@db/schema";
import { db, pool } from "@db";
import { eq } from "drizzle-orm";
import { fromZodError } from "zod-validation-error";
import csurf from "csurf";
import cookieParser from "cookie-parser";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);
const PostgresSessionStore = connectPg(session);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

async function getUserByUsername(username: string) {
  return db.select().from(users).where(eq(users.username, username)).limit(1);
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
    name: 'sid', // Use a generic name instead of 'connect.sid'
    cookie: {
      httpOnly: true, // Prevent client-side access to the cookie
      secure: isProduction, // Require HTTPS in production
      sameSite: 'lax', // Protect against CSRF
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
    // Additional production settings
    proxy: isProduction // Trust the reverse proxy in production
  };

  if (isProduction) {
    app.set("trust proxy", 1);
  }

  // Required middleware
  app.use(cookieParser());
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // Setup CSRF protection
  const csrfProtection = csurf({
    cookie: {
      sameSite: 'strict',
      secure: isProduction
    }
  });

  // Endpoint to get CSRF token
  app.get('/api/csrf-token', csrfProtection, (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
  });

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      const [user] = await getUserByUsername(username);
      if (!user || !(await comparePasswords(password, user.password))) {
        return done(null, false);
      } else {
        return done(null, user);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    done(null, user);
  });

  // Protected routes with CSRF
  app.post("/api/register", csrfProtection, async (req, res, next) => {
    const result = insertUserSchema.safeParse(req.body);
    if (!result.success) {
      const error = fromZodError(result.error);
      return res.status(400).send(error.toString());
    }

    const [existingUser] = await getUserByUsername(result.data.username);
    if (existingUser) {
      return res.status(400).send("Username already exists");
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
  });

  app.post("/api/login", csrfProtection, passport.authenticate("local"), (req, res) => {
    res.status(200).json(req.user);
  });

  app.post("/api/logout", csrfProtection, (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });
}