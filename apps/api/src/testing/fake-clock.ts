import type { Clock } from "../clock.ts";

export interface Duration {
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
}

/**
 * A clock that only moves when a test moves it. It starts at the real time
 * the test API was started and then stands still.
 */
export class FakeClock implements Clock {
  #time: number;

  constructor(start: Date | string = new Date()) {
    this.#time = toTime(start);
  }

  now(): Date {
    return new Date(this.#time);
  }

  /** Jumps to an exact time, given as a Date or an ISO 8601 string. */
  set(time: Date | string): void {
    this.#time = toTime(time);
  }

  /** Moves forward, for example `advance({ seconds: 61 })`. */
  advance(duration: Duration): void {
    const { days = 0, hours = 0, minutes = 0, seconds = 0, milliseconds = 0 } = duration;
    this.#time += (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000 + milliseconds;
  }
}

function toTime(value: Date | string): number {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) throw new Error(`Not a valid time: ${String(value)}`);
  return time;
}
