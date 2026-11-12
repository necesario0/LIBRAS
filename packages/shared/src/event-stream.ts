/** One event of a server-sent event stream (`text/event-stream`). */
export interface StreamEvent {
  /** The `event:` name, or "message" when the stream gave none. */
  event: string;
  /** The `data:` lines joined with a newline. */
  data: string;
}

/**
 * Reads a server-sent event stream from the bytes of a `fetch` response body.
 * Browsers' `EventSource` cannot send an Authorization header, so the desk page
 * reads the stream itself with `fetch` and this.
 *
 * Handles what the LIBRAS API sends and what a proxy may do to it: events cut
 * at any byte (even inside a character), LF or CRLF line ends, `:` comment lines
 * (the keep-alive ping) and events with no data, which are skipped. Lines end
 * with LF or CRLF, as the API writes them. An event cut off by the end of the
 * stream is dropped, never half delivered.
 */
export async function* readEventStream(chunks: AsyncIterable<Uint8Array>): AsyncGenerator<StreamEvent> {
  const decoder = new TextDecoder();
  let pending = "";
  let name = "";
  let data: string[] = [];

  function* readLines(): Generator<StreamEvent> {
    for (;;) {
      const end = pending.indexOf("\n");
      if (end === -1) return;
      const line = pending.slice(0, end).replace(/\r$/, "");
      pending = pending.slice(end + 1);

      if (line === "") {
        if (data.length > 0) yield { event: name || "message", data: data.join("\n") };
        name = "";
        data = [];
      } else if (!line.startsWith(":")) {
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
        if (field === "event") name = value;
        else if (field === "data") data.push(value);
      }
    }
  }

  for await (const chunk of chunks) {
    pending += decoder.decode(chunk, { stream: true });
    yield* readLines();
  }
}
