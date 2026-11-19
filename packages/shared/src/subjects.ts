import { z } from "zod";
import type { UmakCollege } from "./sign-up.ts";

/**
 * Subjects: a plain-English topic worked out from a Book's LC call number, so
 * Members can filter search results by topic (Q4, Q5, Q17 of spec #42). The
 * tables are the ones the project owner accepted on #42 (2026-11-18). Nothing
 * is stored: a Book's Subject is worked out from its call number whenever it is
 * needed, so correcting a row here re-maps the catalog with no migration.
 */

/** The 44 Subjects, in the owner's table order (the order the Filters sheet lists them in). */
export const SUBJECTS = [
  "General Reference",
  "Philosophy",
  "Psychology",
  "Ethics",
  "Religion",
  "World History",
  "Asian and Philippine History",
  "History of the Americas",
  "Geography",
  "Physical Education and Sports",
  "Statistics and Research Methods",
  "Economics",
  "Business and Management",
  "Commerce and Marketing",
  "Accounting and Taxation",
  "Finance and Banking",
  "Sociology",
  "Political Science and Public Administration",
  "Law",
  "Education",
  "Music",
  "Arts, Design and Architecture",
  "Languages and Linguistics",
  "Filipino Language and Literature",
  "Literature",
  "Mathematics",
  "Computer Science",
  "Physics and Astronomy",
  "Chemistry",
  "Earth Sciences",
  "Biology",
  "Medicine and Public Health",
  "Pharmacy",
  "Nursing",
  "Agriculture",
  "General Engineering and Technology",
  "Civil Engineering and Construction",
  "Mechanical and Automotive Engineering",
  "Electrical and Electronics Engineering",
  "Chemical and Manufacturing Technology",
  "Hospitality and Food Service",
  "NSTP and Military Science",
  "Maritime Studies",
  "Library and Information Science",
] as const;

export type Subject = (typeof SUBJECTS)[number];

export const subjectSchema = z.enum(SUBJECTS);

/**
 * How one Subject is found from a call number:
 * - `classes`: LC classes matched exactly ("BF" is BF, not BFA). Where the owner's
 *   table names a span of classes ("BL to BX", "HM to HX"), only the real LC
 *   classes in it are listed, so a mistyped class such as "HR" gets no Subject;
 * - `wholeClasses`: a main class with every class under it ("K" covers KF and KPM);
 * - `ranges`: a class and its class numbers from `from` to `to`, both included.
 *   A range wins over its class's other Subject ("HF5635" is Accounting, "HF5415" Commerce).
 * `covers` is how the Filters sheet names the LC classes, as the owner's table does.
 */
interface SubjectRule {
  subject: Subject;
  covers: string;
  classes?: readonly string[];
  wholeClasses?: readonly string[];
  ranges?: ReadonlyArray<{ lcClass: string; from: number; to: number }>;
}

const RULES: readonly SubjectRule[] = [
  { subject: "General Reference", covers: "A", wholeClasses: ["A"] },
  { subject: "Philosophy", covers: "B (not BF, BJ, BL-BX)", classes: ["B", "BC", "BD", "BH"] },
  { subject: "Psychology", covers: "BF", classes: ["BF"] },
  { subject: "Ethics", covers: "BJ", classes: ["BJ"] },
  { subject: "Religion", covers: "BL-BX", classes: ["BL", "BM", "BP", "BQ", "BR", "BS", "BT", "BV", "BX"] },
  {
    subject: "World History",
    covers: "C, D (not DS)",
    wholeClasses: ["C"],
    classes: ["D", "DA", "DAW", "DB", "DC", "DD", "DE", "DF", "DG", "DH", "DJ", "DJK", "DK", "DL", "DP", "DQ", "DR", "DT", "DU", "DX"],
  },
  { subject: "Asian and Philippine History", covers: "DS", classes: ["DS"] },
  { subject: "History of the Americas", covers: "E, F", classes: ["E", "F"] },
  { subject: "Geography", covers: "G (not GV)", classes: ["G", "GA", "GB", "GC", "GE", "GF", "GN", "GR", "GT"] },
  { subject: "Physical Education and Sports", covers: "GV", classes: ["GV"] },
  { subject: "Statistics and Research Methods", covers: "H, HA", classes: ["H", "HA"] },
  { subject: "Economics", covers: "HB, HC, HE", classes: ["HB", "HC", "HE"] },
  { subject: "Business and Management", covers: "HD", classes: ["HD"] },
  { subject: "Commerce and Marketing", covers: "HF (not HF5601-HF5689)", classes: ["HF"] },
  { subject: "Accounting and Taxation", covers: "HF5601-HF5689, HJ", classes: ["HJ"], ranges: [{ lcClass: "HF", from: 5601, to: 5689 }] },
  { subject: "Finance and Banking", covers: "HG", classes: ["HG"] },
  { subject: "Sociology", covers: "HM-HX", classes: ["HM", "HN", "HQ", "HS", "HT", "HV", "HX"] },
  { subject: "Political Science and Public Administration", covers: "J", wholeClasses: ["J"] },
  { subject: "Law", covers: "K", wholeClasses: ["K"] },
  { subject: "Education", covers: "L", wholeClasses: ["L"] },
  { subject: "Music", covers: "M", wholeClasses: ["M"] },
  { subject: "Arts, Design and Architecture", covers: "N, TR, TT", wholeClasses: ["N"], classes: ["TR", "TT"] },
  {
    subject: "Languages and Linguistics",
    covers: "P-PM (not PL5501-PL6135)",
    classes: ["P", "PA", "PB", "PC", "PD", "PE", "PF", "PG", "PH", "PJ", "PK", "PL", "PM"],
  },
  { subject: "Filipino Language and Literature", covers: "PL5501-PL6135", ranges: [{ lcClass: "PL", from: 5501, to: 6135 }] },
  { subject: "Literature", covers: "PN-PZ, FIC", classes: ["PN", "PQ", "PR", "PS", "PT", "PZ", "FIC"] },
  { subject: "Mathematics", covers: "Q, QA (not QA75-QA76.9, Q334-Q342)", classes: ["Q", "QA"] },
  {
    subject: "Computer Science",
    covers: "QA75-QA76.9, Q334-Q342",
    ranges: [
      { lcClass: "QA", from: 75, to: 76.9 },
      { lcClass: "Q", from: 334, to: 342 },
    ],
  },
  { subject: "Physics and Astronomy", covers: "QB, QC", classes: ["QB", "QC"] },
  { subject: "Chemistry", covers: "QD", classes: ["QD"] },
  { subject: "Earth Sciences", covers: "QE", classes: ["QE"] },
  { subject: "Biology", covers: "QH-QR", classes: ["QH", "QK", "QL", "QM", "QP", "QR"] },
  {
    subject: "Medicine and Public Health",
    covers: "R, RA-RL, RV-RZ",
    classes: ["R", "RA", "RB", "RC", "RD", "RE", "RF", "RG", "RJ", "RK", "RL", "RV", "RX", "RZ"],
  },
  { subject: "Pharmacy", covers: "RM, RS, QV", classes: ["RM", "RS", "QV"] },
  { subject: "Nursing", covers: "RT", classes: ["RT"] },
  { subject: "Agriculture", covers: "S", wholeClasses: ["S"] },
  { subject: "General Engineering and Technology", covers: "T", classes: ["T"] },
  { subject: "Civil Engineering and Construction", covers: "TA, TC, TD, TE, TH", classes: ["TA", "TC", "TD", "TE", "TH"] },
  { subject: "Mechanical and Automotive Engineering", covers: "TJ, TL", classes: ["TJ", "TL"] },
  { subject: "Electrical and Electronics Engineering", covers: "TK", classes: ["TK"] },
  { subject: "Chemical and Manufacturing Technology", covers: "TN, TP, TS", classes: ["TN", "TP", "TS"] },
  { subject: "Hospitality and Food Service", covers: "TX", classes: ["TX"] },
  { subject: "NSTP and Military Science", covers: "U", wholeClasses: ["U"] },
  { subject: "Maritime Studies", covers: "V", wholeClasses: ["V"] },
  { subject: "Library and Information Science", covers: "Z", wholeClasses: ["Z"] },
];

/** The LC classes each Subject covers, as the Filters sheet shows them next to the Subject ("QA75-QA76.9, Q334-Q342"). */
export const SUBJECT_LC_CLASSES = Object.fromEntries(RULES.map((rule) => [rule.subject, rule.covers])) as Record<Subject, string>;

const BY_CLASS = new Map<string, Subject>(RULES.flatMap((rule) => (rule.classes ?? []).map((lcClass) => [lcClass, rule.subject] as const)));
const BY_WHOLE_CLASS = new Map<string, Subject>(RULES.flatMap((rule) => (rule.wholeClasses ?? []).map((lcClass) => [lcClass, rule.subject] as const)));
const RANGES = RULES.flatMap((rule) => (rule.ranges ?? []).map((range) => ({ ...range, subject: rule.subject })));

/**
 * The class letters (one to three) at the start of a call number, and the class
 * number after them when there is one: "QA76.73.J38 D45" is QA and 76.73 (the
 * ".J38" is a cutter, not part of the number). Case and the space after the
 * letters do not matter. Anything else (a Dewey number, a blank) is not LC.
 */
const LC_CALL_NUMBER = /^([A-Z]{1,3})(?![A-Z])\s*(\d+(?:\.\d+)?)?/;

/**
 * The Subject of a Book with this LC call number, or null when it has none: no
 * call number, a call number that is not LC (Dewey, blank), or an LC class the
 * owner's table leaves out (including mistyped classes such as "RDB350").
 */
export function subjectFor(lcCallNumber: string | null): Subject | null {
  if (lcCallNumber === null) return null;
  const match = LC_CALL_NUMBER.exec(lcCallNumber.trim().toUpperCase());
  if (!match) return null;
  const lcClass = match[1] ?? "";
  const classNumber = match[2] === undefined ? undefined : Number(match[2]);
  if (classNumber !== undefined) {
    const range = RANGES.find((candidate) => candidate.lcClass === lcClass && classNumber >= candidate.from && classNumber <= candidate.to);
    if (range) return range.subject;
  }
  return BY_CLASS.get(lcClass) ?? BY_WHOLE_CLASS.get(lcClass.charAt(0)) ?? null;
}

/**
 * The Subjects each UMAK college shows first in the Filters sheet, in the
 * owner's order. Keyed by the college codes, so a college added to sign-up
 * without Subjects is a type error. Maritime Studies is nobody's.
 */
export const COLLEGE_SUBJECTS: Readonly<Record<UmakCollege, readonly Subject[]>> = {
  CCIS: ["Computer Science", "Mathematics", "Electrical and Electronics Engineering", "Statistics and Research Methods"],
  CBFS: [
    "Business and Management",
    "Accounting and Taxation",
    "Finance and Banking",
    "Commerce and Marketing",
    "Economics",
    "Hospitality and Food Service",
  ],
  CGPP: ["Political Science and Public Administration", "Law", "Economics", "Sociology"],
  CLAS: [
    "Literature",
    "Languages and Linguistics",
    "Filipino Language and Literature",
    "Philosophy",
    "Sociology",
    "World History",
    "Asian and Philippine History",
    "Arts, Design and Architecture",
  ],
  CITE: ["Education", "Mathematics", "Literature", "Filipino Language and Literature"],
  "CITE-HSU": ["General Reference", "Mathematics", "Biology", "Chemistry", "Literature"],
  CHK: ["Physical Education and Sports", "Medicine and Public Health", "Biology"],
  CCSE: [
    "Civil Engineering and Construction",
    "Arts, Design and Architecture",
    "General Engineering and Technology",
    "Mathematics",
    "Physics and Astronomy",
  ],
  CET: [
    "Electrical and Electronics Engineering",
    "Mechanical and Automotive Engineering",
    "Chemical and Manufacturing Technology",
    "General Engineering and Technology",
  ],
  SOL: ["Law", "Political Science and Public Administration"],
  IOPsy: ["Psychology", "Statistics and Research Methods", "Sociology", "Biology"],
  ION: ["Nursing", "Medicine and Public Health", "Pharmacy", "Biology", "Chemistry"],
};

/**
 * The Subject options of the Filters sheet, given the Subjects that have Books:
 * the college's Subjects first (in its order) when the Member has a college,
 * then every other one in table order. Subjects with no Book are left out.
 */
export function subjectFilterOptions(
  withBooks: readonly Subject[],
  college: UmakCollege | null,
): { college: Subject[]; others: Subject[] } {
  const present = new Set(withBooks);
  const first = college === null ? [] : COLLEGE_SUBJECTS[college].filter((subject) => present.has(subject));
  const others = SUBJECTS.filter((subject) => present.has(subject) && !first.includes(subject));
  return { college: first, others };
}
