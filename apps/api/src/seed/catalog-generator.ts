// The sample catalog: Books with titles, authors, ISBNs and LC call numbers,
// and their Copies with accession numbers and 1D barcodes. Reproducible: the
// same seed always gives the same catalog (a seeded PRNG, no clock, no
// `Math.random`). Pure data, no database: `seed/catalog.ts` writes it.
//
// Sized to the benchmark scale of ADR 0001: it keeps adding Books until the
// title and author words reach about 50,000 distinct tokens.
//
// LIMITATION: the real UMak catalog is not available. Titles follow common
// library title shapes over a mix of real academic terms, Filipino and English
// names, and pseudo-words built from a syllable model for the long tail. The
// word distribution is plausible, not measured.
import { tokenize } from "@libras/shared";

/** The number of distinct title and author words the default catalog reaches (ADR 0001: about 50,000). */
export const SEARCH_TOKEN_TARGET = 50_000;

export const DEFAULT_CATALOG_SEED = 20261112;

export interface SampleCopy {
  /** Unique, "AC-" and seven digits. */
  accessionNumber: string;
  /** Unique, ten digits: a numeric 1D barcode every common scanner reads. */
  barcode: string;
}

export interface SampleBook {
  title: string;
  /** "Surname, Given". */
  authors: string[];
  edition: string | null;
  publicationYear: number;
  /** ISBN-13 with a valid check digit, digits only. */
  isbn: string;
  lcCallNumber: string;
  copies: SampleCopy[];
}

export interface SampleCatalog {
  seed: number;
  books: SampleBook[];
}

export interface CatalogOptions {
  seed?: number;
  /** Stop once the Books' title and author words reach this many distinct tokens. */
  searchTokens?: number;
  /** The first accession number (and barcode) counter. Another catalog in the same database needs a different range. Default 1. */
  firstCopyNumber?: number;
}

type Rng = () => number;

/** mulberry32: a small seeded PRNG returning numbers in [0, 1). */
function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)] as T;
/** Favours the start of the list: a few entries are used far more than the rest, as in a real catalog. */
const pickSkewed = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * rng() * items.length)] as T;

const TOPICS = (
  "algorithms databases networks security software programming mathematics calculus statistics probability " +
  "physics chemistry biology economics accounting finance marketing history literature philosophy psychology " +
  "sociology education curriculum research methods constitution procedure evidence contracts property torts " +
  "taxation corporation obligations jurisprudence ethics nursing anatomy physiology pharmacology pathology " +
  "medicine health architecture mechanics circuits electronics compilers intelligence learning visualization " +
  "linguistics grammar composition rhetoric poetry fiction drama governance policy ecology geology astronomy " +
  "agriculture entrepreneurship leadership management behavior communication journalism tourism hospitality " +
  "criminology forensics engineering construction thermodynamics hydraulics surveying geography anthropology " +
  "demography logistics operations auditing banking insurance trade entrepreneurship mathematics robotics " +
  "cybersecurity cryptography graphics animation multimedia photography music dance theater art design"
).split(" ");

const ADJECTIVES = [
  "Modern", "Applied", "Advanced", "Essential", "Comprehensive", "Practical", "Contemporary",
  "Elementary", "Critical", "Fundamental", "Strategic", "Integrated", "Philippine", "Global", "Sustainable",
];
const NOUNS = ["Systems", "Methods", "Analysis", "Design", "Principles", "Concepts", "Theory", "Practice", "Foundations", "Perspectives"];
const AUDIENCES = ["Beginners", "Engineers", "Nurses", "Teachers", "Accountants", "Students", "Managers", "Researchers", "Professionals"];
const GIVEN_NAMES = (
  "Maria Jose Juan Ana Carlos Luis Rosa Pedro Elena Miguel Isabel Antonio Teresa Ramon Carmen Fernando Luz " +
  "Eduardo Corazon Ricardo Josefina Roberto Patricia Manuel Cristina Andres Lourdes Rafael Beatriz Gregorio " +
  "John Mary James Robert Michael David Sarah Thomas Emily Daniel Laura Henry Susan Peter Linda Kevin Grace " +
  "Mark Angela Paul Nancy Jennifer Joseph Karen Charles Helen Edward Alice George Anne Samuel Julia Victor Noel"
).split(" ");
const SURNAMES = (
  "Santos Reyes Cruz Bautista Ocampo Garcia Mendoza Torres Tomas Andrada Castillo Flores Villanueva Ramos " +
  "Aquino Dela Rosa Navarro Salazar Domingo Gonzales Rivera Soriano Mercado Lopez Aguilar Padilla Valdez " +
  "Smith Johnson Williams Brown Taylor Anderson Thompson Walker Harris Clark Lewis Robinson Hall Young King"
).split(" ");

const ONSETS = ["", "b", "c", "d", "f", "g", "h", "j", "k", "l", "m", "n", "p", "r", "s", "t", "v", "w", "st", "tr", "pr", "br", "ch", "sh", "th", "gr", "cl", "fl", "pl", "sp", "sc", "bl", "cr", "dr"];
const VOWELS = ["a", "e", "i", "o", "u", "a", "e", "i", "o", "ai", "ea", "io", "ou", "ee", "oo"];
const CODAS = ["", "", "", "n", "r", "s", "t", "l", "m", "d", "ng", "nt", "st", "ck", "rt"];
const NAME_SYLLABLES = ["ma", "ri", "jo", "sa", "lu", "an", "to", "ba", "ca", "de", "la", "gon", "za", "les", "ni", "pa", "ra", "ve", "go", "re", "di", "en", "cia", "san", "tos", "cruz", "ber", "nar", "do", "mi", "ro", "al", "var", "ez", "li", "ko", "ya"];

/** LC classes with the number range seen in them: [letters, low, high]. */
const LC_CLASSES: ReadonlyArray<readonly [string, number, number]> = [
  ["QA", 1, 939], ["QC", 1, 999], ["QD", 1, 999], ["QH", 1, 705], ["TK", 1, 7895], ["TA", 1, 2040],
  ["HF", 1, 6182], ["HG", 1, 9999], ["HD", 1, 9999], ["HB", 1, 3840], ["HM", 1, 1281], ["LB", 1, 3640],
  ["BF", 1, 990], ["BD", 1, 701], ["KPM", 1, 9999], ["PR", 1, 9680], ["PS", 1, 3626], ["PL", 5001, 5497],
  ["DS", 1, 937], ["RT", 1, 120], ["RM", 1, 950], ["RA", 1, 1270], ["NA", 1, 9428], ["TX", 1, 953], ["Z", 1, 1000],
];

const COPY_COUNTS = [1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 4];

function syllableWord(rng: Rng): string {
  const syllables = int(rng, 2, 4);
  let word = "";
  for (let i = 0; i < syllables; i++) {
    word += pick(rng, ONSETS) + pick(rng, VOWELS) + (i === syllables - 1 || rng() < 0.4 ? pick(rng, CODAS) : "");
  }
  return word;
}

function syllableSurname(rng: Rng): string {
  let word = "";
  for (let i = 0, n = int(rng, 2, 4); i < n; i++) word += pick(rng, NAME_SYLLABLES);
  return word;
}

const ORDINALS = ["", "", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
const ordinal = (n: number) => ORDINALS[n] ?? `${n}th`;

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

function digits(rng: Rng, n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) out += String(int(rng, 0, 9));
  return out;
}

function isbn13(rng: Rng, taken: Set<string>): string {
  for (;;) {
    const body = `978${digits(rng, 9)}`;
    const sum = [...body].reduce((total, digit, i) => total + Number(digit) * (i % 2 === 0 ? 1 : 3), 0);
    const isbn = body + String((10 - (sum % 10)) % 10);
    if (!taken.has(isbn)) {
      taken.add(isbn);
      return isbn;
    }
  }
}

function lcCallNumber(rng: Rng, author: string, title: string, year: number): string {
  const [letters, low, high] = pick(rng, LC_CLASSES);
  const number = int(rng, low, high);
  const decimal = rng() < 0.5 ? `.${int(rng, 1, 99)}` : "";
  const cutter = (word: string) => `${word.charAt(0).toUpperCase()}${int(rng, 1, 99)}`;
  return `${letters}${number}${decimal} .${cutter(author)} ${cutter(title)} ${year}`;
}

/** Generates the sample catalog. Deterministic for a given seed and size. */
export function generateCatalog(options: CatalogOptions = {}): SampleCatalog {
  const seed = options.seed ?? DEFAULT_CATALOG_SEED;
  const target = options.searchTokens ?? SEARCH_TOKEN_TARGET;
  const rng = mulberry32(seed);

  const seen = new Set<string>();
  const rareWords: string[] = [];
  const rareSurnames: string[] = [];
  const isbns = new Set<string>();

  /** A long-tail word: new most of the time, otherwise one an earlier Book already used. */
  const rareWord = (): string => {
    if (rareWords.length > 0 && rng() < 0.3) return pickSkewed(rng, rareWords);
    for (;;) {
      const word = syllableWord(rng);
      if (word.length >= 5 && !seen.has(word)) {
        rareWords.push(capitalize(word));
        return capitalize(word);
      }
    }
  };
  const topic = (): string => (rng() < 0.6 ? capitalize(pickSkewed(rng, TOPICS)) : rareWord());
  const surname = (): string => {
    const r = rng();
    if (r < 0.35) return pick(rng, SURNAMES);
    if (r < 0.5 && rareSurnames.length > 0) return pickSkewed(rng, rareSurnames);
    for (;;) {
      const name = syllableSurname(rng);
      if (!seen.has(name)) {
        rareSurnames.push(capitalize(name));
        return capitalize(name);
      }
    }
  };
  const author = (): string => {
    const middle = rng() < 0.3 ? ` ${String.fromCharCode(65 + int(rng, 0, 25))}.` : "";
    return `${surname()}, ${pick(rng, GIVEN_NAMES)}${middle}`;
  };

  const titleTemplates: Array<() => string> = [
    () => `Introduction to ${topic()}`,
    () => `${topic()}: Principles and Practice`,
    () => `Fundamentals of ${topic()} and ${topic()}`,
    () => `A Student's Guide to ${topic()}`,
    () => `The ${rareWord()} Handbook of ${topic()}`,
    () => `${topic()} in the Philippines`,
    () => `${rareWord()} ${topic()}: Theory and Applications`,
    () => `${pick(rng, ADJECTIVES)} ${topic()} ${pick(rng, NOUNS)}`,
    () => `Essentials of ${topic()}`,
    () => `${topic()} for ${pick(rng, AUDIENCES)}`,
    () => `The Life and Times of ${pick(rng, GIVEN_NAMES)} ${surname()}`,
    () => `${rareWord()} and ${rareWord()}: A Study of ${topic()}`,
    () => `Readings in ${topic()}`,
    () => `${topic()} ${pick(rng, NOUNS)} Reviewer`,
  ];

  const books: SampleBook[] = [];
  let copyNumber = (options.firstCopyNumber ?? 1) - 1;
  while (seen.size < target) {
    const title = pick(rng, titleTemplates)();
    const authors = Array.from({ length: pickSkewed(rng, [1, 1, 1, 2, 2, 3]) }, author);
    const year = int(rng, 1985, 2026);
    const edition = rng() < 0.35 ? `${ordinal(int(rng, 2, 9))} ed.` : null;
    const copies: SampleCopy[] = Array.from({ length: pick(rng, COPY_COUNTS) }, () => {
      copyNumber += 1;
      return { accessionNumber: `AC-${String(copyNumber).padStart(7, "0")}`, barcode: `31${String(copyNumber).padStart(8, "0")}` };
    });
    books.push({
      title,
      authors,
      edition,
      publicationYear: year,
      isbn: isbn13(rng, isbns),
      lcCallNumber: lcCallNumber(rng, authors[0] ?? "A", title, year),
      copies,
    });
    for (const word of [...tokenize(title), ...authors.flatMap(tokenize)]) seen.add(word);
  }
  return { seed, books };
}
