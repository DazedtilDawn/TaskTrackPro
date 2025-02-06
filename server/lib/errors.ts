import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, message, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Authentication required") {
    super(401, message);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "Permission denied") {
    super(403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(404, message);
  }
}

export class DatabaseError extends AppError {
  constructor(message = "Database error occurred", details?: unknown) {
    super(500, message, details);
  }
}

export function handleError(err: unknown) {
  if (err instanceof AppError) {
    return {
      status: err.statusCode,
      error: {
        message: err.message,
        details: err.details,
      },
    };
  }

  if (err instanceof ZodError) {
    const validationError = fromZodError(err);
    return {
      status: 400,
      error: {
        message: "Validation error",
        details: validationError.details,
      },
    };
  }

  // Log unexpected errors but don't expose details to client
  console.error("Unexpected error:", err);
  return {
    status: 500,
    error: {
      message: "An unexpected error occurred",
    },
  };
}
