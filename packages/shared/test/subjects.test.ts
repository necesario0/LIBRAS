import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COLLEGE_SUBJECTS, SUBJECTS, SUBJECT_LC_CLASSES, subjectFilterOptions, subjectFor } from "../src/subjects.ts";
import type { Subject } from "../src/subjects.ts";
import { UMAK_COLLEGES } from "../src/sign-up.ts";

/**
 * Every Subject of the table on #42 with call numbers inside, at and just outside its classes and
 * number ranges. `null` means the call number gets no Subject. The expected Subjects are read off
 * the owner's table, not worked out the way the code does.
 */
const TABLE: ReadonlyArray<readonly [string, Subject | null]> = [
  // A (all): General Reference
  ["AE5 .E363 2010", "General Reference"],
  ["A1", "General Reference"],
  ["AY64 .P5", "General Reference"],
  // B (except BF, BJ, BL to BX): Philosophy
  ["B72 .S65", "Philosophy"],
  ["BD21 .R8", "Philosophy"],
  ["BC71 .C66", "Philosophy"],
  ["BH39 .P3", "Philosophy"],
  // BF: Psychology
  ["BF121 .M93 2014", "Psychology"],
  ["BF 1", "Psychology"],
  // BJ: Ethics
  ["BJ1012 .R33", "Ethics"],
  // BL to BX: Religion
  ["BL80.3 .S5", "Religion"],
  ["BS1192 .A4", "Religion"],
  ["BX1751 .C3", "Religion"],
  ["BK 12", null], // between BJ and BL, not an LC class
  // C (all), D (except DS): World History
  ["CB69 .S7", "World History"],
  ["CT104 .B5", "World History"],
  ["D21 .S82", "World History"],
  ["DA30 .T7", "World History"],
  ["DT20 .O4", "World History"],
  // DS: Asian and Philippine History
  ["DS668 .A2 2005", "Asian and Philippine History"],
  ["DS 1", "Asian and Philippine History"],
  // E, F: History of the Americas
  ["E178 .B6", "History of the Americas"],
  ["F1219 .M4", "History of the Americas"],
  ["FG 331.88", null], // mistyped in the real list
  ["FC 164", null], // mistyped in the real list
  // G (except GV): Geography
  ["G1021 .N3", "Geography"],
  ["GB54.5 .S7", "Geography"],
  ["GN25 .K6", "Geography"],
  // GV: Physical Education and Sports
  ["GV341 .W6", "Physical Education and Sports"],
  // H, HA: Statistics and Research Methods
  ["H62 .C7 2014", "Statistics and Research Methods"],
  ["HA29 .A6", "Statistics and Research Methods"],
  // HB, HC, HE: Economics
  ["HB171.5 .M3", "Economics"],
  ["HC453 .P5", "Economics"],
  ["HE151 .T3", "Economics"],
  // HD: Business and Management
  ["HD31 .R6 2018", "Business and Management"],
  // HF (except HF5601 to HF5689): Commerce and Marketing
  ["HF5415 .K6", "Commerce and Marketing"],
  ["HF5600.9 .A2", "Commerce and Marketing"], // just under the Accounting range
  ["HF5690 .B3", "Commerce and Marketing"], // just over it
  ["HF1", "Commerce and Marketing"],
  ["HF", "Commerce and Marketing"],
  // HF5601 to HF5689, HJ: Accounting and Taxation
  ["HF5601 .A1", "Accounting and Taxation"], // at the start
  ["HF 5635 .M3", "Accounting and Taxation"],
  ["HF5686.C7 S5", "Accounting and Taxation"],
  ["HF5689 .Z9", "Accounting and Taxation"], // at the end
  ["HJ2240 .P5", "Accounting and Taxation"],
  // HG: Finance and Banking
  ["HG173 .M5", "Finance and Banking"],
  // HM to HX: Sociology
  ["HM585 .G5", "Sociology"],
  ["HN713 .P5", "Sociology"],
  ["HQ734 .C3", "Sociology"],
  ["HV41 .S6", "Sociology"],
  ["HX44 .M3", "Sociology"],
  ["HR 5686", null], // mistyped in the real list: no LC class HR
  ["HI 99", null],
  ["HU 1559", null],
  ["HHV 4145", null],
  // J: Political Science and Public Administration
  ["JA71 .H4", "Political Science and Public Administration"],
  ["JQ1416 .A5", "Political Science and Public Administration"],
  ["JF1351 .S5", "Political Science and Public Administration"],
  // K: Law
  ["KPM40 .C6", "Law"],
  ["K230 .H3", "Law"],
  ["KF8700 .F3", "Law"],
  // L: Education
  ["LB1025.3 .B7", "Education"],
  ["L7 .J6", "Education"],
  // M: Music
  ["ML160 .G7", "Music"],
  ["MT6 .K6", "Music"],
  // N, TR, TT: Arts, Design and Architecture
  ["NA2750 .C4", "Arts, Design and Architecture"],
  ["NC730 .L6", "Arts, Design and Architecture"],
  ["TR146 .L6", "Arts, Design and Architecture"],
  ["TT507 .S6", "Arts, Design and Architecture"],
  // P to PM (except PL5501 to PL6135): Languages and Linguistics
  ["P121 .Y8", "Languages and Linguistics"],
  ["PE1408 .S8", "Languages and Linguistics"],
  ["PL5500.9 .A2", "Languages and Linguistics"], // just under the Filipino range
  ["PL6136 .A2", "Languages and Linguistics"], // just over it
  ["PL1", "Languages and Linguistics"],
  ["PM8008 .E5", "Languages and Linguistics"],
  // PL5501 to PL6135: Filipino Language and Literature
  ["PL5501 .A1", "Filipino Language and Literature"], // at the start
  ["PL6058.9 .A2", "Filipino Language and Literature"],
  ["PL 6135 .Z9", "Filipino Language and Literature"], // at the end
  // PN to PZ, FIC: Literature
  ["PN4775 .M3", "Literature"],
  ["PR2894 .B6", "Literature"],
  ["PS3545 .H3", "Literature"],
  ["PZ7 .R7", "Literature"],
  ["FIC ROW", "Literature"],
  ["Fic Row", "Literature"],
  // Q (except Q334 to Q342), QA (except QA75 to QA76.9): Mathematics
  ["Q180.55 .M4", "Mathematics"],
  ["Q333.9 .A1", "Mathematics"], // just under the Computer Science range
  ["Q343 .A1", "Mathematics"], // just over it
  ["QA37.3 .S7", "Mathematics"],
  ["QA74.9 .A1", "Mathematics"], // just under
  ["QA76.95 .W6", "Mathematics"], // just over
  ["QA77 .A1", "Mathematics"],
  ["QA303.2 .S7 2016", "Mathematics"],
  // QA75 to QA76.9, Q334 to Q342: Computer Science
  ["QA75 .A1", "Computer Science"], // at the start
  ["QA76.73.J38 D45 2015", "Computer Science"],
  ["qa 76.73 .p98", "Computer Science"],
  ["QA76.9.D3 E57", "Computer Science"], // at the end
  ["Q334 .A1", "Computer Science"], // at the start
  ["Q335 .R86 2010", "Computer Science"],
  ["Q342 .Z9", "Computer Science"], // at the end
  ["QAB 76.73", null], // mistyped in the real list
  // QB, QC: Physics and Astronomy
  ["QB43.3 .S4", "Physics and Astronomy"],
  ["QC21.3 .H35", "Physics and Astronomy"],
  // QD: Chemistry
  ["QD31.3 .Z8", "Chemistry"],
  // QE: Earth Sciences
  ["QE26.3 .T3", "Earth Sciences"],
  // QH to QR: Biology
  ["QH308.2 .C3", "Biology"],
  ["QK47 .R3", "Biology"],
  ["QP34.5 .G8", "Biology"],
  ["QR41.2 .T6", "Biology"],
  // R, RA to RL, RV to RZ: Medicine and Public Health
  ["R121 .D6", "Medicine and Public Health"],
  ["RA425 .P3", "Medicine and Public Health"],
  ["RC46 .H3", "Medicine and Public Health"],
  ["RL71 .F5", "Medicine and Public Health"],
  ["RZ999 .A1", "Medicine and Public Health"],
  ["RAG2600", null], // mistyped in the real list
  ["RDB350", null],
  ["RQC 515", null],
  ["REF 050", null],
  // RM, RS, QV: Pharmacy
  ["RM300 .K3", "Pharmacy"],
  ["RS403 .P3", "Pharmacy"],
  ["QV 4 .G6", "Pharmacy"],
  // RT: Nursing
  ["RT41 .B7 2012", "Nursing"],
  // S: Agriculture
  ["S494.5 .S86", "Agriculture"],
  ["SB320 .H3", "Agriculture"],
  // T: General Engineering and Technology
  ["T55 .G6", "General Engineering and Technology"],
  ["TIN 151", null], // mistyped in the real list
  // TA, TC, TD, TE, TH: Civil Engineering and Construction
  ["TA145 .K6", "Civil Engineering and Construction"],
  ["TD345 .V5", "Civil Engineering and Construction"],
  ["TH145 .A5", "Civil Engineering and Construction"],
  // TJ, TL: Mechanical and Automotive Engineering
  ["TJ145 .S5", "Mechanical and Automotive Engineering"],
  ["TL210 .E6", "Mechanical and Automotive Engineering"],
  // TK: Electrical and Electronics Engineering
  ["TK7867 .B6 2013", "Electrical and Electronics Engineering"],
  // TN, TP, TS: Chemical and Manufacturing Technology
  ["TN145 .G7", "Chemical and Manufacturing Technology"],
  ["TP155 .P4", "Chemical and Manufacturing Technology"],
  ["TS155 .H3", "Chemical and Manufacturing Technology"],
  // TX: Hospitality and Food Service
  ["TX911.3 .M27", "Hospitality and Food Service"],
  ["TF 145", null], // a T subclass the table leaves out
  // U (all): NSTP and Military Science
  ["U21.2 .N3", "NSTP and Military Science"],
  ["UA853 .P6", "NSTP and Military Science"],
  // V (all): Maritime Studies
  ["VK555 .B6", "Maritime Studies"],
  ["V23 .N3", "Maritime Studies"],
  // Z: Library and Information Science
  ["Z665 .R4", "Library and Information Science"],
  ["Z 699.5", "Library and Information Science"],
  // No Subject: Dewey numbers, blanks, other classes
  ["001.4 Gr75r", null],
  ["", null],
  ["   ", null],
  ["W 18 .G6", null],
  ["FILIPINIANA 12", null],
];

describe("subjectFor: the Subject an LC call number belongs to", () => {
  for (const [callNumber, subject] of TABLE) {
    it(`${JSON.stringify(callNumber)} is ${subject ?? "no Subject"}`, () => {
      assert.equal(subjectFor(callNumber), subject);
    });
  }

  it("gives no Subject to a Book with no call number", () => {
    assert.equal(subjectFor(null), null);
  });

  it("covers all 44 Subjects of the owner's table", () => {
    assert.equal(SUBJECTS.length, 44);
    const covered = new Set(TABLE.map(([, subject]) => subject));
    assert.deepEqual(
      SUBJECTS.filter((subject) => !covered.has(subject)),
      [],
    );
  });

  it("names the LC classes each Subject covers", () => {
    assert.equal(SUBJECT_LC_CLASSES["Computer Science"], "QA75-QA76.9, Q334-Q342");
    assert.equal(SUBJECT_LC_CLASSES["Arts, Design and Architecture"], "N, TR, TT");
    for (const subject of SUBJECTS) assert.ok(SUBJECT_LC_CLASSES[subject].length > 0, subject);
  });
});

describe("college Subjects", () => {
  it("gives every UMAK college its Subjects in the owner's order", () => {
    assert.deepEqual(COLLEGE_SUBJECTS.CCIS, [
      "Computer Science",
      "Mathematics",
      "Electrical and Electronics Engineering",
      "Statistics and Research Methods",
    ]);
    assert.deepEqual(COLLEGE_SUBJECTS.IOPsy, ["Psychology", "Statistics and Research Methods", "Sociology", "Biology"]);
    assert.deepEqual(COLLEGE_SUBJECTS.SOL, ["Law", "Political Science and Public Administration"]);
    for (const college of UMAK_COLLEGES) assert.ok(COLLEGE_SUBJECTS[college].length > 0, college);
  });

  it("puts no college first for Maritime Studies", () => {
    assert.ok(UMAK_COLLEGES.every((college) => !COLLEGE_SUBJECTS[college].includes("Maritime Studies")));
  });

  it("lists the college's Subjects that have Books first, then the rest in table order", () => {
    const available: Subject[] = ["Law", "Mathematics", "Biology", "Computer Science", "Maritime Studies"];
    assert.deepEqual(subjectFilterOptions(available, "CCIS"), {
      college: ["Computer Science", "Mathematics"],
      others: ["Law", "Biology", "Maritime Studies"],
    });
  });

  it("lists every Subject that has Books in table order when the Member has no college", () => {
    assert.deepEqual(subjectFilterOptions(["Maritime Studies", "Law", "Biology"], null), {
      college: [],
      others: ["Law", "Biology", "Maritime Studies"],
    });
  });
});
