// Makes a printable page of Copy labels (Code 128 barcodes): `npm run labels` for the
// local database, `npm run labels:hosted` for the hosted one (reads .env.hosted).
//
//   npm run labels -- --title "algorithms" [--books 1] [--copies 3]
//   npm run labels -- 3100000001 3100000002 ...        (by barcode)
//   add  --out labels.html  to choose the file (default: copy-labels.html where you ran it)
//
// `--title` picks Books whose title contains the text and that have at least `--copies`
// available Copies, and prints that many Copies of each. Open the file in Chrome and
// print at 100% scale on white matte paper. Reads only; changes nothing in the database.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "../src/config.ts";
import { createDatabase } from "../src/db.ts";
import { renderCopyLabels } from "../src/labels/render.ts";
import type { CopyLabel } from "../src/labels/render.ts";

interface Options {
  title?: string;
  books: number;
  copies: number;
  out: string;
  barcodes: string[];
}

function parse(argv: string[]): Options {
  const options: Options = { books: 1, copies: 3, out: resolve(process.env.INIT_CWD ?? process.cwd(), "copy-labels.html"), barcodes: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    const value = (): string => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      return next;
    };
    if (arg === "--title") options.title = value();
    else if (arg === "--books") options.books = Number(value());
    else if (arg === "--copies") options.copies = Number(value());
    else if (arg === "--out") options.out = resolve(process.env.INIT_CWD ?? process.cwd(), value());
    else if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}`);
    else options.barcodes.push(arg);
  }
  if (!Number.isInteger(options.books) || options.books < 1 || !Number.isInteger(options.copies) || options.copies < 1) throw new Error("--books and --copies must be whole numbers of at least 1");
  if (options.title === undefined && options.barcodes.length === 0) throw new Error('Say which Copies: --title "text", or one or more barcodes');
  return options;
}

interface Row {
  barcode: string;
  accession_number: string;
  title: string;
  lc_call_number: string | null;
  book_id: string;
}

const COLUMNS = "c.barcode, c.accession_number, b.title, b.lc_call_number, b.id as book_id";

async function main(): Promise<number> {
  const options = parse(process.argv.slice(2));
  const config = loadConfig();
  const db = createDatabase(config.databaseUrl, console, config.databaseCaCertificate);
  try {
    let rows: Row[];
    if (options.barcodes.length > 0) {
      rows = (
        await db.query<Row>(`select ${COLUMNS} from public.copies c join public.books b on b.id = c.book_id where c.barcode = any($1) order by c.barcode`, [options.barcodes])
      ).rows;
      const missing = options.barcodes.filter((barcode) => !rows.some((row) => row.barcode === barcode));
      if (missing.length > 0) throw new Error(`No Copy has the barcode ${missing.join(", ")}`);
    } else {
      const found = await db.query<Row>(
        `with picked as (
           select b.id from public.books b
           where b.title ilike $1
             and (select count(*) from public.copies c where c.book_id = b.id and c.status = 'available') >= $2
           order by b.title, b.id limit $3
         )
         select ${COLUMNS} from public.copies c join public.books b on b.id = c.book_id
         where b.id in (select id from picked) and c.status = 'available'
         order by b.title, b.id, c.accession_number`,
        [`%${(options.title as string).replace(/[\\%_]/g, (character) => `\\${character}`)}%`, options.copies, options.books],
      );
      const perBook = new Map<string, number>();
      rows = found.rows.filter((row) => {
        const n = (perBook.get(row.book_id) ?? 0) + 1;
        perBook.set(row.book_id, n);
        return n <= options.copies;
      });
      if (rows.length === 0) throw new Error(`No Book with "${options.title}" in its title has ${options.copies} available Copies`);
    }
    const labels: CopyLabel[] = rows.map((row) => ({ barcode: row.barcode, accessionNumber: row.accession_number, title: row.title, callNumber: row.lc_call_number }));
    writeFileSync(options.out, renderCopyLabels(labels));
    console.log(`${labels.length} label${labels.length === 1 ? "" : "s"} written to ${options.out}`);
    for (const row of rows) console.log(`  ${row.barcode}  ${row.accession_number}  ${row.title}`);
    return 0;
  } finally {
    await db.end();
  }
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "The labels could not be made");
  process.exitCode = 1;
}
