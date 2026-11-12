import type { AccountType } from "@libras/shared";

/**
 * How many hours an Account Type's Hold is weighted ahead of its arrival (ADR 0001,
 * spec #2): Faculty 24, NTP / Employee 12, UMAK Student 0. Visitor and Alumni cannot
 * place a Hold, so their weight is never used and is 0.
 */
export const HOLD_WEIGHT_HOURS: Record<AccountType, number> = {
  faculty: 24,
  ntp_employee: 12,
  umak_student: 0,
  visitor: 0,
  alumni: 0,
};

const HOUR_MS = 60 * 60 * 1000;

/**
 * The priority score of a Hold: its arrival time minus the Account Type's weight.
 * The lower the score, the sooner the Hold is served; the dispatcher orders a Book's
 * waiting Holds by (score, seq).
 */
export function holdScore(placedAt: Date, accountType: AccountType): Date {
  return new Date(placedAt.getTime() - HOLD_WEIGHT_HOURS[accountType] * HOUR_MS);
}
