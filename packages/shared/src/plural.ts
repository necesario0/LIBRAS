/** "Loan" or "Loans": the noun in the form that goes with `count`. Every noun LIBRAS counts takes a plain "s". */
export function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}

/** "1 day", "3 days", "0 Loans": a count with its noun. */
export function counted(count: number, noun: string): string {
  return `${count} ${plural(count, noun)}`;
}
