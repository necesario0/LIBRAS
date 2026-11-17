/**
 * Fines (ADR 0010): the peso amount a Member owes for one Loan returned late.
 * Amounts are whole centavos everywhere (500 = PHP 5), so no amount is ever a
 * fraction. The API works every Fine out; the app and the desk page only show it.
 */

/** The Fine of one Loan: the Fine so far while the Loan is out and overdue, or the final amount fixed at its return. */
export interface LoanFine {
  /** What the Member owes, in centavos: the daily rate for every day late, up to the cap. */
  amountCentavos: number;
  /** Calendar days after the due date, the day of the return (or today) included. */
  daysLate: number;
  /** The daily Fine rate it was worked out with, in centavos. */
  dailyRateCentavos: number;
  /** The Fine cap it was worked out with, in centavos. */
  capCentavos: number;
  /** True once the Copy is returned: the amount is fixed for good. False while it still grows (the Fine so far). */
  final: boolean;
}

/** "PHP 15", "PHP 2.50", "PHP 1,234,567": an amount in centavos as LIBRAS writes it. */
export function formatPesos(centavos: number): string {
  const pesos = Math.floor(centavos / 100);
  const rest = centavos % 100;
  const whole = pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return rest === 0 ? `PHP ${whole}` : `PHP ${whole}.${String(rest).padStart(2, "0")}`;
}
