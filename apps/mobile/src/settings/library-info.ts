import { SATURDAY_HOURS, WEEKDAY_HOURS } from "@libras/shared";

/**
 * What Library info shows: hours, location and contact, as static text until
 * the library supplies the real ones (spec #42, Q24). Every value marked
 * `toConfirm` is an example: the screen says so under the table, and the
 * marked values are what the library has to confirm before release.
 */
export interface LibraryInfoFact {
  label: string;
  value: string;
  /** An example value the library has not confirmed yet. */
  toConfirm: boolean;
}

export interface LibraryInfoSection {
  title: string;
  facts: readonly LibraryInfoFact[];
}

export const LIBRARY_INFO: readonly LibraryInfoSection[] = [
  {
    title: "Opening hours",
    facts: [
      { label: "Monday to Friday", value: WEEKDAY_HOURS.label, toConfirm: true },
      { label: "Saturday", value: SATURDAY_HOURS.label, toConfirm: true },
      { label: "Sunday and holidays", value: "Closed", toConfirm: true },
    ],
  },
  {
    title: "Where",
    facts: [
      { label: "University Library", value: "Building and floor to confirm", toConfirm: true },
      { label: "Campus", value: "J.P. Rizal Ext., West Rembo, Taguig", toConfirm: true },
    ],
  },
  {
    title: "Contact",
    facts: [
      { label: "Email", value: "library@umak.edu.ph", toConfirm: true },
      { label: "Phone", value: "To confirm", toConfirm: true },
    ],
  },
];

/** The line under the tables while any value is still an example. */
export const LIBRARY_INFO_NOTE = "Example values. The library supplies the real hours and contacts before release.";

/** Whether any shown value still waits for the library. */
export const libraryInfoHasExamples = LIBRARY_INFO.some((section) => section.facts.some((fact) => fact.toConfirm));
