import type { InquiryType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { notifyNewInquiry } from '../../lib/notify.js';

export interface InquiryInput {
  type: InquiryType;
  name: string;
  phone: string;
  email?: string;
  subject?: string;
  message: string;
  meta?: Prisma.InputJsonValue;
  ip?: string;
}

export async function createInquiry(input: InquiryInput) {
  const inquiry = await prisma.inquiry.create({ data: { ...input, ip: input.ip?.slice(0, 45) } });
  void notifyNewInquiry(inquiry);
  return inquiry;
}

export const INQUIRY_STATUSES = ['NEW', 'IN_PROGRESS', 'CLOSED', 'SPAM'] as const;
