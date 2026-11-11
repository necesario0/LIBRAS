// Measures catalog search through the real API over HTTP on the seeded catalog
// (`npm run seed` first). Run: `npm run measure:search -w @libras/api`.
//
// It signs a Member up, then sends searches built from the sample catalog's own
// titles and authors: exact words, words with one or two typos, and nonsense
// that matches nothing. First one request at a time, then 50 at once (the
// SRS target is 1.0 s at 50 concurrent users). Prints milliseconds.
import { tokenize } from "@libras/shared";
import { generateCatalog } from "../src/seed/catalog-generator.ts";
import { createTestMember, startTestApi } from "../src/testing/index.ts";

const SEQUENTIAL = 600;
const CONCURRENT_USERS = 50;
const ROUNDS_PER_USER = 12;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function withTypos(rng: () => number, word: string, edits: number): string {
  let q = word;
  for (let e = 0; e < edits && q.length > 3; e++) {
    const i = Math.floor(rng() * q.length);
    const op = Math.floor(rng() * 3);
    if (op === 0) q = q.slice(0, i) + "abcdefghijklmnopqrstuvwxyz"[Math.floor(rng() * 26)] + q.slice(i + 1);
    else if (op === 1) q = q.slice(0, i) + q.slice(i + 1);
    else q = q.slice(0, i) + "abcdefghijklmnopqrstuvwxyz"[Math.floor(rng() * 26)] + q.slice(i);
  }
  return q;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

function summarize(label: string, samples: number[], wallMs?: number): void {
  const sorted = [...samples].sort((a, b) => a - b);
  const extra = wallMs === undefined ? "" : `  ${Math.round((samples.length / wallMs) * 1000)} req/s`;
  console.log(
    `${label.padEnd(34)} n=${String(samples.length).padStart(5)}  p50 ${percentile(sorted, 50).toFixed(1)}  p95 ${percentile(sorted, 95).toFixed(1)}  p99 ${percentile(sorted, 99).toFixed(1)}  max ${(sorted.at(-1) ?? 0).toFixed(1)}${extra}`,
  );
}

const api = await startTestApi();
try {
  const books = generateCatalog().books;
  const count = (await api.db.query("select count(*)::int as n from public.books")).rows[0].n as number;
  if (count < books.length) throw new Error(`The database has ${count} Books, the sample catalog has ${books.length}. Run npm run seed first.`);
  const member = await createTestMember(api);
  const headers = { authorization: `Bearer ${member.accessToken}` };

  const rng = mulberry32(99);
  const words = books.flatMap((book) => [...tokenize(book.title), ...book.authors.flatMap(tokenize)]).filter((word) => word.length >= 5);
  const pickWord = () => words[Math.floor(rng() * words.length)] ?? "library";
  const pickBook = () => books[Math.floor(rng() * books.length)] ?? books[0];
  const queryOf = (kind: number): string => {
    if (kind === 0) return pickWord(); // exact word
    if (kind === 1) return withTypos(rng, pickWord(), 1);
    if (kind === 2) return withTypos(rng, pickWord(), 2);
    if (kind === 3) return `${pickWord()} ${pickWord()}`; // two words, usually no Book has both
    if (kind === 4) return pickBook()?.isbn ?? "9780000000000"; // exact identifier
    return withTypos(rng, `${pickWord()}${pickWord()}`, 2); // matches nothing
  };
  const timed = async (query: string): Promise<number> => {
    const start = performance.now();
    const response = await fetch(`${api.baseUrl}/catalog/search?q=${encodeURIComponent(query)}`, { headers });
    await response.arrayBuffer();
    if (response.status !== 200) throw new Error(`search failed with ${response.status}`);
    return performance.now() - start;
  };

  const first = await timed("introduction");
  console.log(`first search, builds the index (${count} Books): ${first.toFixed(0)} ms`);
  const rebuildProbe = await api.db.query("insert into public.books (title, authors) values ('Rebuild probe', '{}') returning id");
  const afterChange = await timed("introduction");
  await api.db.query("delete from public.books where id = $1", [rebuildProbe.rows[0].id]);
  console.log(`first search after a catalog change, rebuilds: ${afterChange.toFixed(0)} ms`);
  await timed("introduction"); // rebuild after the delete, so the numbers below are steady state

  const kinds = ["exact word", "1 typo", "2 typos", "two words", "ISBN", "no match"];
  const sequential = kinds.map(() => [] as number[]);
  const all: number[] = [];
  for (let i = 0; i < SEQUENTIAL; i++) {
    const kind = i % kinds.length;
    const ms = await timed(queryOf(kind));
    sequential[kind]?.push(ms);
    all.push(ms);
  }
  console.log("\none request at a time:");
  kinds.forEach((kind, i) => summarize(kind, sequential[i] ?? []));
  summarize("all", all);

  const concurrent: number[] = [];
  const started = performance.now();
  await Promise.all(
    Array.from({ length: CONCURRENT_USERS }, async () => {
      for (let round = 0; round < ROUNDS_PER_USER; round++) concurrent.push(await timed(queryOf(Math.floor(rng() * kinds.length))));
    }),
  );
  console.log(`\n${CONCURRENT_USERS} users at once, ${ROUNDS_PER_USER} searches each:`);
  summarize("all", concurrent, performance.now() - started);
} finally {
  await api.close();
}
