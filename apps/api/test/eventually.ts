/**
 * Calls `read` until `done` accepts what it returned, or fails after
 * `timeoutMs`. A catalog change reaches search results after the search index
 * has been rebuilt in the background, so a test that changes the catalog
 * waits for the result instead of expecting it on the very next request.
 */
export async function eventually<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value) || Date.now() > deadline) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
