export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Resource') => new AppError(404, 'not_found', `${what} not found`);
export const conflict = (message: string) => new AppError(409, 'conflict', message);
export const forbidden = () => new AppError(403, 'forbidden', 'You do not have access to this resource');
export const badRequest = (message: string) => new AppError(422, 'validation_error', message);
