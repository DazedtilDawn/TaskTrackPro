import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ValidationError } from "../lib/errors";
import { fromZodError } from "zod-validation-error";

export function validateRequest<T extends z.ZodType>(schema: T) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.body);
      if (!result.success) {
        throw new ValidationError(
          "Invalid request data",
          fromZodError(result.error).toString()
        );
      }
      // Add the validated data to the request object
      req.validatedData = result.data;
      next();
    } catch (error) {
      next(error);
    }
  };
}

// Type augmentation for Express Request
declare global {
  namespace Express {
    interface Request {
      validatedData: any;
    }
  }
}
