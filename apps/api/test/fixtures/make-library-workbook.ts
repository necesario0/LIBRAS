// Writes `library-workbook.xlsx` next to this file: a small, made-up workbook
// in the format of the library's accession list (the real one is private and
// never committed). Run it again after changing the rows:
//
//   node apps/api/test/fixtures/make-library-workbook.ts
//
// Every title, name and number here is invented. Accession numbers start at
// 90001 so they never meet the real catalog (1 to about 15,000) in a shared
// local database. The columns the seed must never copy hold SENTINEL values,
// which `seed-library-catalog.test.ts` looks for everywhere in the database.
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const PROFESSIONAL_HEADERS = [
  " Accession No.", "DATE RECEIVED", "SECTION", "CALL NUMBER", "ISBN", "AUTHOR", "  TITLE", "EDITION", "VOLUME",
  "PUBLISHER", "PLACE OF PUBLICATION", "COPYRIGHT YEAR", "PAGES", "ILLUSTRATIONS", "SIZE", "SOURCE OF FUNDS", "COST",
  "NOTES", "SERIES", "SUBJECT", "ADDED AUTHOR", "CONTENT", "SUMMARY", "LOCATION", "CATALOGER", "REMARKS", "COPY", "BARCODE",
];
const TEXTBOOKS_HEADERS = ["ACCESSION NO.", "DATE", ...PROFESSIONAL_HEADERS.slice(2, -1)];

/** The values of the columns the seed must never read. The test looks for each of them in the database. */
export const PRIVATE_SENTINELS = {
  sourceOfFunds: "SENTINEL-FUNDS-4417",
  cost: 98765.43,
  notes: "SENTINEL-NOTES-5521",
  cataloger: "SENTINEL-CATALOGER-6630",
  remarks: "SENTINEL-REMARKS-7742",
} as const;

/** The workbook's colour legend, as the library's sheet has it (colour in B, words in C). */
const LEGEND: [string, string][] = [
  ["FF9FC5E8", "Cataloged"],
  ["FF999999", "ReChecked by librarian"],
  ["FFEA9999", "Wrong data"],
  ["FFB6D7A8", "Last Accession No"],
  ["FFB4A7D6", "for review"],
  ["FF9900FF", "remove accession no"],
];

type Value = string | number | Date | null;

interface Row {
  accession: Value;
  date?: Value;
  call?: Value;
  isbn?: Value;
  author?: Value;
  title?: Value;
  edition?: Value;
  publisher?: Value;
  year?: Value;
  addedAuthor?: Value;
  content?: Value;
  summary?: Value;
  /** Professional only: a formula `=A<row>` like the real sheet, a number, or nothing. */
  barcode?: "formula" | number | null;
  fill?: string;
}

const PROFESSIONAL: Row[] = [
  {
    accession: 90001,
    date: new Date(Date.UTC(2024, 5, 3)),
    call: " QA76.73.P98   L37 2020 ",
    isbn: 9780306406157,
    author: "Lovelace, Ada, writer",
    title: "  Learning   Made-up Python ",
    edition: "2nd ed.",
    publisher: "Imaginary Press",
    year: 2020,
    addedAuthor: "Byron, Augusta, contributor.",
    content: "Part 1. Made-up basics -- Part 2. More made-up basics.",
    summary: "A short made-up summary.",
    barcode: "formula",
  },
  {
    accession: 90002.0,
    // A day serial with no date format: 2024-06-07.
    date: 45450,
    call: "QA76.73.P98 L37 2020",
    isbn: 9780306406157,
    author: "Lovelace, Ada",
    title: "Learning Made-up Python",
    edition: "2nd ed.",
    year: 2020,
    summary: "  A longer made-up summary about zephyrine snakes, kept because it is the longest.  ",
    barcode: 90002,
  },
  {
    accession: 90003,
    date: "06/10/2024",
    call: "G1021 .A7 2019",
    // An ISBN-10 that lost its leading zero when Excel stored it as a number.
    isbn: 198526636,
    author: "Reyes, Juan and Cruz, Maria, editors",
    title: "Made-up Atlas of Nowhere",
    year: 2019,
    barcode: null,
    fill: "FFEA9999",
  },
  { accession: 90004, date: "06 /11/2024", call: "QH45.2 .M3", title: "Made-up Field Guide", author: "Santos, Pedro", year: "c2018", barcode: "formula" },
  { accession: 90005, call: "QH45.2  .M3", title: "made-up   field guide.", author: "Santos, Pedro", barcode: "formula", fill: "FFB4A7D6" },
  { accession: 90006, date: new Date(Date.UTC(22025, 2, 1)), call: "QH45.2 .M4", title: "Made-up Field Guide", author: "Santos, Pedro", barcode: "formula" },
  { accession: 90007, barcode: "formula" },
  { accession: 90008, call: "HHV 4145", title: "Made-up Mistyped Shelf", barcode: "formula", fill: "FF8E7CC3" },
  { accession: 90009, call: "001.4 Gr75r", title: "Made-up Dewey Book", barcode: "formula" },
  { accession: 90010, title: "Made-up Uncatalogued Book", year: "199[?]", barcode: "formula" },
];

const TEXTBOOKS: Row[] = [
  { accession: 90001, date: new Date(Date.UTC(2024, 6, 1)), call: "QA76.73.P98 L37 2020", isbn: 9780306406157, title: "Learning Made-up Python", edition: "2nd ed." },
  { accession: 90002, call: "QD31.3 .M3", isbn: "978-1-4028-9462-6 (pbk.)", author: "Dela Cruz, Rosa, author.", title: "Made-up Textbook of Imaginary Chemistry", publisher: "Nowhere Books" },
  { accession: 90003, date: "07/02/2024" },
];

function addSheet(workbook: ExcelJS.Workbook, name: string, headers: string[], rows: Row[], accessionFormat: string, hasBarcode: boolean): void {
  const sheet = workbook.addWorksheet(name);
  sheet.addRow(headers);
  rows.forEach((row, index) => {
    const r = index + 2;
    const values: (Value | ExcelJS.CellFormulaValue)[] = [
      row.accession, row.date ?? null, null, row.call ?? null, row.isbn ?? null, row.author ?? null, row.title ?? null,
      row.edition ?? null, null, row.publisher ?? null, "Nowhere City", row.year ?? null, "xii, 300 p.", "ill.", "23 cm",
      PRIVATE_SENTINELS.sourceOfFunds, PRIVATE_SENTINELS.cost, PRIVATE_SENTINELS.notes, null, null, row.addedAuthor ?? null,
      row.content ?? null, row.summary ?? null, "Shelf 9", PRIVATE_SENTINELS.cataloger, PRIVATE_SENTINELS.remarks, "c.1",
    ];
    if (hasBarcode) {
      values.push(row.barcode === "formula" ? { formula: `A${r}`, result: Number(row.accession) } : (row.barcode ?? null));
    }
    const added = sheet.addRow(values);
    added.getCell(1).numFmt = accessionFormat;
    if (row.date instanceof Date) added.getCell(2).numFmt = "mm/dd/yyyy";
    if (row.fill) {
      for (let col = 1; col <= values.length; col++) {
        added.getCell(col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: row.fill } };
      }
    }
  });
}

const workbook = new ExcelJS.Workbook();
addSheet(workbook, "OFFICIAL LIST (Professional)", PROFESSIONAL_HEADERS, PROFESSIONAL, "00000", true);
addSheet(workbook, "OFFICIAL LIST (Textbooks)", TEXTBOOKS_HEADERS, TEXTBOOKS, '"TX"00000', false);
const legend = workbook.addWorksheet("LEGEND");
legend.getCell("A1").value = "LEGEND:";
LEGEND.forEach(([argb, words], index) => {
  const row = index + 2;
  legend.getCell(row, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
  legend.getCell(row, 3).value = words;
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await workbook.xlsx.writeFile(fileURLToPath(new URL("library-workbook.xlsx", import.meta.url)));
}
