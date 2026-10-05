import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { logger } from './logger.js';

const SENSITIVE = new Set(['passwordHash', 'password', 'codeHash', 'tokenHash']);

function clean(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  const json = JSON.parse(
    JSON.stringify(value, (k, v) => (SENSITIVE.has(k) ? '[redacted]' : typeof v === 'bigint' ? v.toString() : v)),
  );
  return json as Prisma.InputJsonValue;
}

/** Records an admin write action. Never throws so it cannot break the request that triggered it. */
export async function audit(
  req: Request,
  action: string,
  entity: string,
  entityId?: string | number | null,
  before?: unknown,
  after?: unknown,
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: req.session.user?.id,
        action,
        entity,
        entityId: entityId === undefined || entityId === null ? null : String(entityId),
        before: clean(before) ?? Prisma.DbNull,
        after: clean(after) ?? Prisma.DbNull,
        ip: req.ip?.slice(0, 45),
      },
    });
  } catch (err) {
    logger.error({ err, action, entity, entityId }, 'Audit log write failed');
  }
}
