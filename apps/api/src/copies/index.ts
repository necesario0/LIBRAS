import type { CopyStatus } from "@libras/shared";
import type { Tx } from "../db.ts";

/** A Copy as circulation reads it: Loans, returns, Hold dispatch and Pickup Window expiry. */
export interface CopyRow {
  id: string;
  book_id: string;
  accession_number: string;
  status: CopyStatus;
  /** The title of the Copy's Book. */
  title: string;
}

/** Which Copy a scan names: the barcode, or the accession number typed by hand in either case. `$1` is the scan. */
export const COPY_MATCH = "(c.barcode = $1 or c.accession_number = $1 or c.accession_number = upper($1))";
/** A barcode match wins over an accession number match, and an exact one over an upper-cased one. */
export const COPY_ORDER = "(c.barcode = $1) desc, (c.accession_number = $1) desc";

/**
 * A Copy named by what the desk scanned (its barcode, or its accession number
 * typed by hand in either case), or by its id for a writer that starts from a
 * Hold (cancelling a ready Hold, a Pickup Window passing).
 */
export type CopyKey = { code: string } | { id: string };

/**
 * The Copy, with its row locked until the transaction ends (`for no key
 * update`): two writers of one Copy run one after another, and the second sees
 * the status the first one left. The lock order of every writer is the
 * Member's row, then the Copy's row, then a Hold's row.
 */
export async function lockCopy(tx: Tx, copy: CopyKey): Promise<CopyRow | undefined> {
  const [where, value] = "id" in copy ? ["c.id = $1", copy.id] : [`${COPY_MATCH} order by ${COPY_ORDER}`, copy.code];
  const { rows } = await tx.query<CopyRow>(
    `select c.id, c.book_id, c.accession_number, c.status, b.title
       from public.copies c
       join public.books b on b.id = c.book_id
      where ${where}
      limit 1
        for no key update of c`,
    [value],
  );
  return rows[0];
}
