import { Prisma } from '@prisma/client';

/** InnoDB deadlocks (1213), lock wait timeouts (1205) and serialization failures (Prisma P2034). */
export const isRetryableTxError = (err: unknown) =>
  (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') ||
  (err instanceof Error && /deadlock|could not serialize|write conflict|1213|1205/i.test(err.message));

/**
 * Runs a transaction and retries it when the database aborted it because of a concurrent
 * transaction. Under SERIALIZABLE, a loser is aborted even when capacity remains, so retrying
 * is what lets parallel requests fill every free place while never overbooking.
 */
export async function withTxRetry<T>(fn: () => Promise<T>, attempts = 8): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts || !isRetryableTxError(err)) throw err;
      await new Promise((r) => setTimeout(r, 10 + Math.random() * 40 * i));
    }
  }
}
