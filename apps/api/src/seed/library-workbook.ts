// Reads the library's accession list (an Excel workbook, `2024-0807_LLC Official
// List`) into Books and Copies. The workbook is private and never committed: it
// is read from a path given at run time.
//
// Only the catalog columns are read (CATALOG_COLUMNS). Cost, source of funds,
// cataloguer, notes and remarks are never looked at, so they cannot reach the
// database or a log.
import ExcelJS from "exceljs";

/**
 * The two accession series. Both sheets number their accessions from 1, so the
 * same number appears twice. THE ONE PLACE that decides how they are told
 * apart: Professional accessions are five digits ("00042"), Textbooks
 * accessions carry "TX" ("TX00042"), as the workbook's own cell formats show
 * them. A Copy without a usable barcode gets `barcodePrefix` and its accession
 * number in eight digits (10 digits, ADR 0004).
 *
 * TO CONFIRM WITH THE LIBRARY: how the physical labels tell the two series
 * apart. Changing the prefix here and seeding an empty catalog again is all a
 * different answer needs.
 */
export const ACCESSION_SERIES = [
  { name: "Professional", sheet: "OFFICIAL LIST (Professional)", accessionPrefix: "", digits: 5, barcodePrefix: "10" },
  { name: "Textbooks", sheet: "OFFICIAL LIST (Textbooks)", accessionPrefix: "TX", digits: 5, barcodePrefix: "20" },
] as const;

/** Copy barcodes are 10 digits (ADR 0004); a shorter workbook barcode is padded with zeros. */
const BARCODE_DIGITS = 10;

/** The columns read, by header (trimmed, upper case). Nothing else in a row is ever read. */
const CATALOG_COLUMNS = {
  accession: ["ACCESSION NO."],
  received: ["DATE RECEIVED", "DATE"],
  callNumber: ["CALL NUMBER"],
  isbn: ["ISBN"],
  author: ["AUTHOR"],
  title: ["TITLE"],
  edition: ["EDITION"],
  publisher: ["PUBLISHER"],
  year: ["COPYRIGHT YEAR"],
  addedAuthor: ["ADDED AUTHOR"],
  contents: ["CONTENT"],
  summary: ["SUMMARY"],
  barcode: ["BARCODE"],
} as const;
type Column = keyof typeof CATALOG_COLUMNS;
const OPTIONAL_COLUMNS: readonly Column[] = ["barcode"];

/** The colour legend marks the seed reports instead of importing silently. */
const REPORTED_MARKS = ["Wrong data", "for review", "remove accession no"];
/** Fills that mean "no mark". */
const UNMARKED_FILLS = new Set(["FFFFFFFF"]);

export interface ImportedCopy {
  accessionNumber: string;
  barcode: string;
  /** "YYYY-MM-DD", or null when the workbook does not say. */
  receivedOn: string | null;
}

export interface ImportedBook {
  title: string;
  authors: string[];
  edition: string | null;
  publisher: string | null;
  publicationYear: number | null;
  isbn: string | null;
  lcCallNumber: string | null;
  summary: string | null;
  contents: string | null;
  copies: ImportedCopy[];
}

export interface WorkbookReport {
  /** Rows not imported, by reason, each named "<series> row <n>". */
  skipped: { reason: string; rows: string[] }[];
  /** Imported rows the colour legend marks as needing a look. */
  marked: { mark: string; accessionNumbers: string[] }[];
  /** Imported rows with a colour the legend does not list: ask the project owner. */
  unlistedColours: { colour: string; accessionNumbers: string[] }[];
  /** Whether the workbook has a colour legend at all. */
  legendFound: boolean;
  callNumbers: { missing: number; deweyStyle: number; likelyMistyped: { callNumber: string; copies: number }[] };
  /** Imported Copies whose value could not be read, so it was left empty. */
  unreadable: { isbn: number; dateReceived: number; copyrightYear: number };
}

export interface LibraryWorkbook {
  books: ImportedBook[];
  report: WorkbookReport;
}

interface Row {
  label: string;
  accessionNumber: string;
  barcode: string;
  receivedOn: string | null;
  title: string;
  authors: string[];
  edition: string | null;
  publisher: string | null;
  year: number | null;
  isbn: string | null;
  callNumber: string | null;
  summary: string | null;
  contents: string | null;
  fill: string | null;
}

/** Reads and cleans the workbook. Throws when a sheet or a required column is missing. */
export async function readLibraryWorkbook(path: string): Promise<LibraryWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const legend = readLegend(workbook);
  const skipped = new Map<string, string[]>();
  const skip = (reason: string, label: string) => skipped.set(reason, [...(skipped.get(reason) ?? []), label]);
  const unreadable = { isbn: 0, dateReceived: 0, copyrightYear: 0 };
  const rows: Row[] = [];
  const barcodes = new Set<string>();

  for (const series of ACCESSION_SERIES) {
    const sheet = workbook.getWorksheet(series.sheet);
    if (!sheet) throw new Error(`The workbook has no sheet "${series.sheet}"`);
    const columns = columnsOf(sheet);
    const accessions = new Set<string>();
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const cell = (column: Column) => (columns[column] === undefined ? null : row.getCell(columns[column]));
      const text = (column: Column) => textOf(cell(column));
      const label = `${series.name} row ${rowNumber}`;

      const title = cleanTitle(text("title"));
      const writtenCallNumber = collapse(text("callNumber"));
      const callNumber = writtenCallNumber && NO_CALL_NUMBER.test(writtenCallNumber) ? null : writtenCallNumber;
      const rawAccession = cell("accession")?.value;
      if (!title && !callNumber) {
        if (rawAccession !== null && rawAccession !== undefined) skip("no title and no call number", label);
        return;
      }
      if (!title) return skip("no title", label);
      const accessionNumber = accessionOf(series, rawAccession);
      if (!accessionNumber) return skip("no accession number", label);
      if (accessions.has(accessionNumber)) return skip("accession number used by an earlier row", label);
      const barcode = barcodeOf(series, text("barcode"), accessionNumber);
      if (!barcode) return skip("no barcode, and no number to make one from", label);
      if (barcodes.has(barcode)) return skip("barcode used by an earlier row", label);
      accessions.add(accessionNumber);
      barcodes.add(barcode);

      const isbnText = text("isbn");
      const isbn = isbnOf(cell("isbn")?.value, isbnText);
      if (isbnText && !isbn) unreadable.isbn++;
      const receivedOn = dateOf(cell("received")?.value);
      if (receivedOn === undefined) unreadable.dateReceived++;
      const yearText = text("year");
      const year = yearOf(yearText);
      if (yearText && year === null) unreadable.copyrightYear++;
      const fill = cell("accession")?.fill;
      rows.push({
        label,
        accessionNumber,
        barcode,
        receivedOn: receivedOn ?? null,
        title,
        authors: [...new Set([...authorsOf(text("author")), ...authorsOf(text("addedAuthor"))])],
        edition: collapse(text("edition")),
        publisher: collapse(text("publisher")),
        year,
        isbn,
        callNumber,
        summary: longText(text("summary")),
        contents: longText(text("contents")),
        fill: fill?.type === "pattern" && fill.fgColor?.argb ? fill.fgColor.argb.toUpperCase() : null,
      });
    });
  }

  return {
    books: groupIntoBooks(rows),
    report: {
      skipped: [...skipped].map(([reason, labels]) => ({ reason, rows: labels })),
      ...marksOf(rows, legend),
      legendFound: legend !== undefined,
      callNumbers: callNumberReport(rows),
      unreadable,
    },
  };
}

function columnsOf(sheet: ExcelJS.Worksheet): Partial<Record<Column, number>> {
  const byHeader = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => byHeader.set(collapse(textOf(cell))?.toUpperCase() ?? "", col));
  const columns: Partial<Record<Column, number>> = {};
  for (const [column, headers] of Object.entries(CATALOG_COLUMNS) as [Column, readonly string[]][]) {
    const index = headers.map((header) => byHeader.get(header)).find((found) => found !== undefined);
    if (index === undefined && !OPTIONAL_COLUMNS.includes(column)) {
      throw new Error(`The sheet "${sheet.name}" has no ${headers.join(" or ")} column`);
    }
    if (index !== undefined) columns[column] = index;
  }
  return columns;
}

/** The legend sheet: a fill colour and the words next to it, on each row. Undefined when the workbook has none. */
function readLegend(workbook: ExcelJS.Workbook): Map<string, string> | undefined {
  const sheet = workbook.worksheets.find((candidate) => candidate.name.trim().toUpperCase() === "LEGEND");
  if (!sheet) return undefined;
  const legend = new Map<string, string>();
  sheet.eachRow((row) => {
    let colour: string | undefined;
    let words: string | undefined;
    row.eachCell({ includeEmpty: true }, (cell) => {
      const fill = cell.fill;
      if (fill?.type === "pattern" && fill.fgColor?.argb) colour ??= fill.fgColor.argb.toUpperCase();
      words ??= collapse(textOf(cell)) ?? undefined;
    });
    if (colour && words) legend.set(colour, words);
  });
  return legend;
}

function marksOf(rows: readonly Row[], legend: Map<string, string> | undefined): Pick<WorkbookReport, "marked" | "unlistedColours"> {
  const marked = new Map<string, string[]>(REPORTED_MARKS.map((mark) => [mark, []]));
  const unlisted = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.fill || UNMARKED_FILLS.has(row.fill)) continue;
    const words = legend?.get(row.fill);
    const mark = REPORTED_MARKS.find((candidate) => candidate.toLowerCase() === words?.toLowerCase());
    if (mark) marked.get(mark)?.push(row.accessionNumber);
    else if (words === undefined) unlisted.set(row.fill, [...(unlisted.get(row.fill) ?? []), row.accessionNumber]);
  }
  return {
    marked: [...marked].filter(([, accessions]) => accessions.length > 0).map(([mark, accessionNumbers]) => ({ mark, accessionNumbers })),
    unlistedColours: [...unlisted].map(([colour, accessionNumbers]) => ({ colour, accessionNumbers })),
  };
}

/**
 * The LC classes the Subject table of spec #42 covers. A call number shaped
 * like an LC one ("QA76.73 ...") whose class letters are not covered is
 * reported as likely mistyped ("HHV 4145", "RAG2600": the Copies the comment on
 * #42 lists). Classes the table takes whole (such as K, which has many
 * three-letter subclasses) accept any letters after the first; the others
 * accept only the subclasses the table names.
 */
const WHOLE_CLASSES = new Set("A B C D G J K L M N P U V Z".split(" "));
const NAMED_SUBCLASSES = new Set(
  (
    "E F FIC H HA HB HC HD HE HF HG HJ HM HN HQ HS HT HV HX Q QA QB QC QD QE QH QK QL QM QP QR QV " +
    "R RA RB RC RD RE RF RG RJ RK RL RM RS RT RV RX RZ S SB SD SF SH SK T TA TC TD TE TH TJ TK TL TN TP TR TS TT TX"
  ).split(" "),
);

/** How the workbook says a Copy has no call number yet, besides leaving the cell empty. */
const NO_CALL_NUMBER = /^no call number$/i;

function callNumberReport(rows: readonly Row[]): WorkbookReport["callNumbers"] {
  const report = { missing: 0, deweyStyle: 0, likelyMistyped: [] as { callNumber: string; copies: number }[] };
  const mistyped = new Map<string, number>();
  for (const { callNumber } of rows) {
    if (!callNumber) report.missing++;
    else if (/^[0-9]/.test(callNumber)) report.deweyStyle++;
    else {
      const letters = /^([A-Za-z]+)\s*[0-9]/.exec(callNumber)?.[1];
      const classLetters = letters?.toUpperCase();
      if (classLetters && !WHOLE_CLASSES.has(classLetters.charAt(0)) && !NAMED_SUBCLASSES.has(classLetters)) mistyped.set(callNumber, (mistyped.get(callNumber) ?? 0) + 1);
    }
  }
  report.likelyMistyped = [...mistyped].map(([callNumber, copies]) => ({ callNumber, copies }));
  return report;
}

/** Copies of one Book: the same ISBN, or without one the same normalised title, edition and call number. */
function groupIntoBooks(rows: readonly Row[]): ImportedBook[] {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = row.isbn ? `isbn ${row.isbn}` : ["text", normalise(row.title), normalise(row.edition), normalise(row.callNumber)].join("\u0000");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map((copies) => {
    const first = <T>(pick: (row: Row) => T | null): T | null => copies.map(pick).find((value) => value !== null && value !== undefined) ?? null;
    const longest = (pick: (row: Row) => string | null): string | null =>
      copies.map(pick).reduce<string | null>((best, value) => (value && value.length > (best?.length ?? 0) ? value : best), null);
    const head = copies[0] as Row;
    return {
      title: head.title,
      authors: copies.find((row) => row.authors.length > 0)?.authors ?? [],
      edition: first((row) => row.edition),
      publisher: first((row) => row.publisher),
      publicationYear: first((row) => row.year),
      isbn: head.isbn,
      lcCallNumber: first((row) => row.callNumber),
      summary: longest((row) => row.summary),
      contents: longest((row) => row.contents),
      copies: copies.map((row) => ({ accessionNumber: row.accessionNumber, barcode: row.barcode, receivedOn: row.receivedOn })),
    };
  });
}

// ---- Cleaning one cell ----

type CellValue = ExcelJS.CellValue;

/** A cell's text: the result of a formula, the words of rich text or a link, a number as written. */
function textOf(cell: ExcelJS.Cell | null): string | null {
  const value = plain(cell?.value);
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return null;
}

function plain(value: CellValue | undefined): CellValue | undefined {
  if (value === null || value === undefined || typeof value !== "object" || value instanceof Date) return value;
  if ("result" in value) return plain(value.result as CellValue);
  if ("richText" in value) return value.richText.map((part) => part.text).join("");
  if ("text" in value) return typeof value.text === "string" ? value.text : null;
  return null;
}

function collapse(text: string | null): string | null {
  const cleaned = text?.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned : null;
}

/** A title without stray spaces or the cataloguer's trailing " /", ":" or ";". */
function cleanTitle(text: string | null): string | null {
  return collapse(text?.replace(/[\s/:;,]+$/, "") ?? null);
}

/** Summary and contents: trimmed, line breaks kept, plain text as written. */
function longText(text: string | null): string | null {
  const cleaned = text?.replace(/\r\n?/g, "\n").trim();
  return cleaned ? cleaned : null;
}

/** For grouping only: case, spacing, accents and final punctuation do not tell Books apart. */
function normalise(text: string | null): string {
  return (text ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").replace(/[\s.,/:;]+$/, "").trim();
}

/** The accession number as the series writes it: "00042" or "TX00042". Excel stores "2" as 2 or 2.0. */
function accessionOf(series: (typeof ACCESSION_SERIES)[number], raw: CellValue | undefined): string | null {
  const value = plain(raw);
  const text = typeof value === "number" ? (Number.isInteger(value) ? String(value) : null) : typeof value === "string" ? value.trim() : null;
  if (!text) return null;
  const number = /^([0-9]+)(?:\.0+)?$/.exec(text)?.[1];
  if (number === undefined) return text;
  return `${series.accessionPrefix}${number.padStart(series.digits, "0")}`;
}

/** The workbook's barcode in 10 digits, or one made from the series and the accession number. */
function barcodeOf(series: (typeof ACCESSION_SERIES)[number], workbookBarcode: string | null, accessionNumber: string): string | null {
  const digits = workbookBarcode?.trim().replace(/\.0+$/, "");
  if (digits && /^[0-9]+$/.test(digits) && digits.length <= BARCODE_DIGITS) return digits.padStart(BARCODE_DIGITS, "0");
  const number = accessionNumber.slice(series.accessionPrefix.length);
  const width = BARCODE_DIGITS - series.barcodePrefix.length;
  if (!/^[0-9]+$/.test(number) || number.replace(/^0+/, "").length > width) return null;
  return `${series.barcodePrefix}${number.replace(/^0+/, "").padStart(width, "0")}`;
}

/**
 * An ISBN-10 or ISBN-13, digits only (an ISBN-10 may end in X). Excel stores
 * an ISBN typed as a number as floating point, which drops an ISBN-10's
 * leading zero; it is rebuilt from the number. Null when nothing usable is there.
 */
function isbnOf(raw: CellValue | undefined, text: string | null): string | null {
  const value = plain(raw);
  if (typeof value === "number") {
    const digits = Math.round(value).toString();
    if (digits.length === 13) return /^97[89]/.test(digits) ? digits : null;
    if (digits.length <= 10 && digits.length >= 9) return digits.padStart(10, "0");
    return null;
  }
  for (const part of (text ?? "").split(/[/;,(]|\s{2,}/)) {
    const candidate = part.toUpperCase().replace(/[^0-9X]/g, "");
    if (/^97[89][0-9]{10}$/.test(candidate) || /^[0-9]{9}[0-9X]$/.test(candidate)) return candidate;
  }
  return null;
}

/** Days from 1899-12-30 (Excel's day 0) to 1970-01-01. */
const EXCEL_EPOCH_DAYS = 25569;
const DAY_MS = 86_400_000;

/** "YYYY-MM-DD"; null for an empty cell; undefined for a value that cannot be read. */
function dateOf(raw: CellValue | undefined): string | null | undefined {
  const value = plain(raw);
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10);
  if (typeof value === "number") return value > 0 ? new Date(Math.round((value - EXCEL_EPOCH_DAYS) * DAY_MS)).toISOString().slice(0, 10) : undefined;
  if (typeof value !== "string" || !value.trim()) return null;
  const parts = /^([0-9]{1,2})[/.]+([0-9]{1,2})[/.]+([0-9]{4})$/.exec(value.replace(/\s+/g, "").replace(/\/+/g, "/"));
  if (!parts) return undefined;
  let [month, day] = [Number(parts[1]), Number(parts[2])];
  const year = Number(parts[3]);
  // The sheets write month/day/year; a first number over 12 can only be a day.
  if (month > 12 && day <= 12) [month, day] = [day, month];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return date.toISOString().slice(0, 10);
}

/** A year from "2020", "c2018" or "2020?"; null for "199[?]" or anything without a whole year. */
function yearOf(text: string | null): number | null {
  const year = /(?:^|[^0-9])([12][0-9]{3})(?![0-9])/.exec(text ?? "")?.[1];
  return year ? Number(year) : null;
}

/** What is not a name: "and 3 others", "et al." */
const NOT_A_NAME = /^(?:and\s+)?(?:[0-9]+\s+)?others?\.?$|^et\.?\s*al\.?$/i;
/** A role or dates after a name: ", writer", ", editors", " (editor)", ", 1946-". */
const ROLE_SUFFIX =
  /(?:(?:,\s*|\s*\()(?:writer|authors?|editors?|eds?\.|compilers?|contributors?|illustrators?|translators?|photographers?)\.?\)?\.?|,\s*[0-9]{4}-(?:[0-9]{4})?\.?)\s*$/i;

/** "Surname, Given, writer and Other, Name" as ["Surname, Given", "Other, Name"]. */
function authorsOf(text: string | null): string[] {
  if (!text) return [];
  const names: string[] = [];
  for (const part of text.split(/;|&|\n|\s+and\s+/i)) {
    let name = collapse(part) ?? "";
    for (let previous = ""; previous !== name; ) {
      previous = name;
      name = name.replace(ROLE_SUFFIX, "").replace(/[\s,]+$/, "").trim();
    }
    // A full stop after a whole word (not an initial or "Jr.") is the cataloguer's, not the name's.
    name = name.replace(/([a-z]{3,})\.$/, "$1");
    if (name && !NOT_A_NAME.test(name)) names.push(name);
  }
  return names;
}
