import type { ReactNode } from "react";
import { formatPesos } from "@libras/shared";

interface Props {
  /** The panel's heading, with the name in `<strong className="return-panel__name">` when it names someone. */
  title: ReactNode;
  /** The heading level, so the panel fits under its section's own heading. */
  heading: "h3" | "h4";
  /** One line under the title: why the Fine is what it is. */
  reason: string;
  amountCentavos: number;
  /** Under the panel's own row: Paid and Waived, or how the Fine was settled. */
  actions: ReactNode;
  /** The panel's test id; its reason and amount are `-reason` and `-amount`. */
  testId: string;
}

/**
 * A Fine on the desk page, in red: what it is for, how much, and what the
 * Librarian can do about it. The return screen and the Member panel both show
 * Fines this way.
 */
export function FinePanel({ title, heading: Heading, reason, amountCentavos, actions, testId }: Props) {
  return (
    <div className="return-panel return-panel--fine" data-testid={testId}>
      <svg className="return-panel__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
      </svg>
      <div className="return-panel__text">
        <Heading className="return-panel__title">{title}</Heading>
        <span className="return-panel__body" data-testid={`${testId}-reason`}>
          {reason}
        </span>
      </div>
      <div className="return-panel__side">
        <span className="return-panel__side-label">Fine</span>
        <span className="return-panel__amount" data-testid={`${testId}-amount`}>
          {formatPesos(amountCentavos)}
        </span>
      </div>
      <div className="return-panel__actions">{actions}</div>
    </div>
  );
}
