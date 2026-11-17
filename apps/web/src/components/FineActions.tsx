import { useState } from "react";
import { formatPesos } from "@libras/shared";
import type { FineOutcome } from "@libras/shared";
import { ApiError } from "../api.ts";

interface Props {
  amountCentavos: number;
  memberName: string;
  /** Settles the Fine. Rejects with the reason to show; resolves once it is settled, and the caller then stops showing these buttons. */
  settle: (outcome: FineOutcome) => Promise<void>;
  /** A line beside the buttons while the Librarian is choosing. */
  hint?: string;
  /** Prefix of the test ids: `-paid`, `-waive`, `-confirm`, `-keep`, `-error`. */
  testId: string;
}

type Step = { kind: "choose" } | { kind: "confirm_waive" } | { kind: "saving" } | { kind: "refused"; message: string };

/**
 * Paid and Waived for one unsettled Fine. Paid settles at once. Waived forgives
 * money, so it first asks the Librarian to confirm, naming the Member and the
 * amount; a waived Fine cannot be reopened.
 */
export function FineActions({ amountCentavos, memberName, settle, hint, testId }: Props) {
  const [step, setStep] = useState<Step>({ kind: "choose" });

  async function run(outcome: FineOutcome) {
    setStep({ kind: "saving" });
    try {
      await settle(outcome);
    } catch (error) {
      setStep({ kind: "refused", message: error instanceof ApiError ? error.message : "Something went wrong. Please try again." });
    }
  }

  if (step.kind === "confirm_waive") {
    return (
      <div className="fine-actions" role="group" aria-label="Confirm waiving the Fine">
        <p className="fine-actions__text fine-actions__text--ask">
          {`Waive ${formatPesos(amountCentavos)} for `}
          <strong>{memberName}</strong>
          {"? A waived Fine cannot be reopened."}
        </p>
        <div className="fine-actions__buttons">
          <button className="button button--quiet" type="button" data-testid={`${testId}-keep`} onClick={() => setStep({ kind: "choose" })}>
            Keep it
          </button>
          <button className="button button--danger" type="button" data-testid={`${testId}-confirm`} onClick={() => void run("waived")}>
            Yes, waive it
          </button>
        </div>
      </div>
    );
  }

  const busy = step.kind === "saving";
  return (
    <div className="fine-actions" role="group" aria-label="Settle the Fine">
      {step.kind === "refused" ? (
        <p className="fine-actions__text fine-actions__text--error" role="alert" data-testid={`${testId}-error`}>
          {step.message}
        </p>
      ) : (
        hint && <p className="fine-actions__text">{hint}</p>
      )}
      <div className="fine-actions__buttons">
        <button className="button button--quiet" type="button" disabled={busy} data-testid={`${testId}-waive`} onClick={() => setStep({ kind: "confirm_waive" })}>
          Waived
        </button>
        <button className="button" type="button" disabled={busy} data-testid={`${testId}-paid`} onClick={() => void run("paid")}>
          Paid
        </button>
      </div>
    </div>
  );
}
