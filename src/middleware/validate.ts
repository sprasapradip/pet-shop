import type { Request, RequestHandler } from 'express';
import type { ZodSchema, ZodTypeDef } from 'zod';
import { AppError } from '../lib/errors.js';

export function validationError(issues: { path: (string | number)[]; message: string; code: string }[]) {
  return new AppError(
    422,
    'validation_error',
    'Please correct the highlighted fields',
    issues.map((i) => ({ field: i.path.join('.'), message: i.message, code: i.code })),
  );
}

/** Parses data with a Zod schema or throws a 422 AppError with field details. */
export function parse<T>(schema: ZodSchema<T, ZodTypeDef, unknown>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw validationError(result.error.issues);
  return result.data;
}

export const validate =
  (schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body'): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) return next(validationError(result.error.issues));
    (req as unknown as Record<string, unknown>)[`validated${source[0]!.toUpperCase()}${source.slice(1)}`] = result.data;
    return next();
  };

export const validatedBody = <T>(req: Request) => (req as unknown as { validatedBody: T }).validatedBody;
