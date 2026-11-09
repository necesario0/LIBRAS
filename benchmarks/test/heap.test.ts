import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mulberry32, pick, randInt } from "../src/prng.ts";
import { dispatcherFactories } from "../src/registry.ts";
import { less, makeReservation } from "../src/heap/types.ts";
import type { Reservation, Role } from "../src/heap/types.ts";

const ROLES: Role[] = ["Faculty", "Student", "NTP", "Visitor"];

/** Reference model: a plain array we fully re-sort. Obviously correct, deliberately slow. */
class Model {
  items: Reservation[] = [];
  push(r: Reservation) { this.items.push(r); }
  remove(id: number) {
    const i = this.items.findIndex((x) => x.id === id);
    if (i < 0) return false;
    this.items.splice(i, 1);
    return true;
  }
  popMin() {
    if (!this.items.length) return undefined;
    this.items.sort((a, b) => (less(a, b) ? -1 : less(b, a) ? 1 : 0));
    return this.items.shift();
  }
  get size() { return this.items.length; }
}

describe("all dispatchers serve in the same order as the reference model", () => {
  for (const make of dispatcherFactories) {
    const probe = make();
    it(probe.name, () => {
      const rng = mulberry32(99);
      const d = make();
      const model = new Model();
      let nextId = 0;
      let t = 1_700_000_000_000;
      const live: number[] = [];
      for (let step = 0; step < 6000; step++) {
        const op = rng();
        if (op < 0.5) {
          t += randInt(rng, 1, 5000);
          const r = makeReservation(nextId++, t, pick(rng, ROLES));
          d.push(r); model.push(r); live.push(r.id);
        } else if (op < 0.75) {
          const want = model.popMin();
          const got = d.popMin();
          assert.equal(got?.id, want?.id, `${probe.name} popMin at step ${step}`);
          if (want) live.splice(live.indexOf(want.id), 1);
        } else if (op < 0.9 && live.length) {
          const idx = randInt(rng, 0, live.length - 1);
          const id = live[idx]!;
          assert.equal(d.remove(id), model.remove(id), `${probe.name} remove(${id})`);
          live.splice(idx, 1);
        } else {
          assert.equal(d.remove(-1), false);
          assert.equal(d.peek()?.id, model.items.length ? [...model.items].sort((a, b) => (less(a, b) ? -1 : 1))[0]!.id : undefined, `${probe.name} peek`);
        }
        assert.equal(d.size, model.size, `${probe.name} size at step ${step}`);
      }
      // drain
      for (;;) {
        const want = model.popMin();
        const got = d.popMin();
        assert.equal(got?.id, want?.id);
        if (!want) break;
      }
    });
  }
});

describe("role weighting semantics from the milestone", () => {
  it("a Faculty member arriving up to 24h later outranks an earlier Student", () => {
    const student = makeReservation(1, 1_000_000, "Student");
    const faculty = makeReservation(2, 1_000_000 + 86_000_000, "Faculty"); // 23.9h later
    assert.ok(less(faculty, student));
  });
  it("a Visitor is deprioritised below a Student who arrived 24h later", () => {
    const visitor = makeReservation(1, 1_000_000, "Visitor");
    const student = makeReservation(2, 1_000_000 + 86_000_000, "Student");
    assert.ok(less(student, visitor));
  });
  it("equal-role reservations are served FIFO", () => {
    for (const make of dispatcherFactories) {
      const d = make();
      for (let i = 0; i < 20; i++) d.push(makeReservation(i, 1000 + i, "Student"));
      for (let i = 0; i < 20; i++) assert.equal(d.popMin()?.id, i, d.name);
    }
  });
});
