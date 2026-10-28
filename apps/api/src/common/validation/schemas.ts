import { z, ZodSchema } from 'zod';
import { ErrorCode } from '@exprest/types';
import { AppError } from '../errors/AppError.js';

/**
 * Validates that a string is a real calendar date (handles month days & leap years).
 * Format: YYYY-MM-DD
 */
export function isValidCalendarDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;

  // Days in month calculation (handles leap years correctly)
  const maxDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= maxDays;
}

export const trainSearchQuerySchema = z.object({
  q: z.string().max(100, 'Search query cannot exceed 100 characters').default(''),
});

export const journeyParamSchema = z.object({
  journeyId: z
    .string()
    .min(3, 'Journey ID is too short')
    .max(64, 'Journey ID is too long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Journey ID must contain only alphanumeric characters, underscores, or hyphens')
    .refine(
      (val) => {
        if (!val.startsWith('journey_')) return true;
        const parts = val.split('_');
        if (parts.length < 3) return false;
        const trainNum = parts[1];
        const datePart = parts.slice(2).join('_');
        if (!/^\d{4,5}$/.test(trainNum)) return false;
        return isValidCalendarDate(datePart);
      },
      {
        message: 'journeyId must have format journey_{trainNumber}_{YYYY-MM-DD} with a valid real calendar date',
      }
    ),
});

export const poiQuerySchema = z.object({
  category: z
    .enum(['station', 'food', 'fuel', 'hospital', 'stay', 'emergency'])
    .optional(),
});

export const createShareBodySchema = z.object({
  journeyId: z
    .string()
    .min(3, 'journeyId is required and must be at least 3 characters')
    .max(64, 'journeyId cannot exceed 64 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'journeyId contains invalid characters')
    .refine(
      (val) => {
        if (!val.startsWith('journey_')) return true;
        const parts = val.split('_');
        if (parts.length < 3) return false;
        const trainNum = parts[1];
        const datePart = parts.slice(2).join('_');
        if (!/^\d{4,5}$/.test(trainNum)) return false;
        return isValidCalendarDate(datePart);
      },
      {
        message: 'journeyId must specify a valid real calendar date',
      }
    ),
  expiresInSeconds: z
    .number()
    .int('expiresInSeconds must be an integer')
    .positive('expiresInSeconds must be positive')
    .max(30 * 86400, 'expiresInSeconds cannot exceed 30 days')
    .optional(),
});

export const shareParamSchema = z.object({
  shareToken: z
    .string()
    .min(3, 'Share token is too short')
    .max(128, 'Share token is too long')
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Share token contains invalid characters'),
});

export const pnrParamSchema = z.object({
  pnr: z
    .string()
    .transform((val) => val.replace(/[\s.-]/g, ''))
    .refine((val) => /^\d{10}$/.test(val), {
      message: 'PNR must be exactly 10 numeric digits',
    }),
});

export const trainFareParamSchema = z.object({
  trainNumber: z
    .string()
    .regex(/^\d{4,5}$/, 'Train number must be 4 to 5 numeric digits'),
});

export const trainFareQuerySchema = z.object({
  from: z.string().max(10).optional().default(''),
  to: z.string().max(10).optional().default(''),
  date: z
    .string()
    .refine((val) => isValidCalendarDate(val), {
      message: 'Date must be a valid real calendar date formatted as YYYY-MM-DD',
    })
    .optional(),
  class: z.string().max(5).optional(),
  quota: z.string().max(5).optional(),
});

export function validateInput<T>(
  schema: ZodSchema<T>,
  data: unknown,
  customErrorCode: ErrorCode = 'VALIDATION_ERROR'
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const pathStr = firstIssue?.path?.length ? `${firstIssue.path.join('.')}: ` : '';
    const message = firstIssue ? `${pathStr}${firstIssue.message}` : 'Validation failed';
    throw new AppError(customErrorCode, message, 400, false);
  }
  return result.data;
}
