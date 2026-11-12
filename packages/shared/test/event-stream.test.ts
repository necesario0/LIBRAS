import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readEventStream } from "../src/index.ts";
import type { StreamEvent } from "../src/index.ts";

const encoder = new TextEncoder();

async function* chunks(...parts: (string | Uint8Array)[]): AsyncGenerator<Uint8Array> {
  for (const part of parts) yield typeof part === "string" ? encoder.encode(part) : part;
}

async function collect(source: AsyncIterable<Uint8Array>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of readEventStream(source)) events.push(event);
  return events;
}

describe("reading a server-sent event stream", () => {
  it("reads named events with their data", async () => {
    const events = await collect(chunks('event: scan\ndata: {"text":"123"}\n\nevent: paired\ndata: {}\n\n'));

    assert.deepEqual(events, [
      { event: "scan", data: '{"text":"123"}' },
      { event: "paired", data: "{}" },
    ]);
  });

  it("puts together an event that arrives in pieces, even in the middle of a line or a character", async () => {
    const bytes = encoder.encode("event: scan\ndata: Muñoz\n\n");
    const cut = bytes.indexOf(0xc3) + 1; // between the two bytes of the n with a tilde
    const events = await collect(chunks(bytes.slice(0, 8), bytes.slice(8, cut), bytes.slice(cut)));

    assert.deepEqual(events, [{ event: "scan", data: "Muñoz" }]);
  });

  it("ignores comment lines (the keep-alive pings) and events with no data", async () => {
    const events = await collect(chunks(": ping\n\nevent: nothing\n\n: ping\n\nevent: scan\ndata: 7\n\n"));

    assert.deepEqual(events, [{ event: "scan", data: "7" }]);
  });

  it("joins several data lines with a newline, and accepts CRLF line ends", async () => {
    const events = await collect(chunks("event: note\r\ndata: one\r\ndata: two\r\n\r\n"));

    assert.deepEqual(events, [{ event: "note", data: "one\ntwo" }]);
  });

  it("names an event with no event line 'message'", async () => {
    const events = await collect(chunks("data: hello\n\n"));

    assert.deepEqual(events, [{ event: "message", data: "hello" }]);
  });

  it("drops an event that was cut off by the end of the stream", async () => {
    const events = await collect(chunks("event: scan\ndata: 1\n\nevent: scan\ndata: 2"));

    assert.deepEqual(events, [{ event: "scan", data: "1" }]);
  });
});
