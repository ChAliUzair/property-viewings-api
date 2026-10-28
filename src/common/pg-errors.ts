import { QueryFailedError } from 'typeorm';

/** PostgreSQL SQLSTATE codes we translate into HTTP errors. */
export const PG_UNIQUE_VIOLATION = '23505';
export const PG_EXCLUSION_VIOLATION = '23P01';

export function pgErrorCode(err: unknown): string | undefined {
  if (err instanceof QueryFailedError) {
    return (err.driverError as { code?: string } | undefined)?.code;
  }
  return undefined;
}

export function isPgError(err: unknown, code: string, constraint?: string): boolean {
  if (pgErrorCode(err) !== code) return false;
  if (!constraint) return true;
  const driver = (err as QueryFailedError).driverError as { constraint?: string };
  return driver.constraint === constraint;
}
