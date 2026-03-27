import type { NextFunction, Request, Response } from "express";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  // In production you would remove stack traces or gate them behind NODE_ENV.
  const message =
    err instanceof Error && err.message
      ? err.message
      : "Unexpected backend error";
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: message });
}

