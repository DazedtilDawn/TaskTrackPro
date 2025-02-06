import { Request, Response, NextFunction } from "express";
import { handleError } from "../lib/errors";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { status, error } = handleError(err);
  res.status(status).json(error);
}
