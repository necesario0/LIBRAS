/**
 * The only source of the current time in the API. Code that needs "now"
 * (Digital ID windows, due dates, the Pickup Window) takes it from here and
 * passes it to PostgreSQL as a parameter, so tests can control time.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
