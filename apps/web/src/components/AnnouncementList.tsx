import { useState } from "react";
import { formatAnnouncementDay } from "@libras/shared";
import type { Announcement, DeskAnnouncementsResponse } from "@libras/shared";
import { ApiError, GENERIC_ERROR_MESSAGE } from "../api.ts";

interface Props {
  list: DeskAnnouncementsResponse | undefined;
  /** The one open in the form, highlighted. */
  openId: string | undefined;
  onNew: () => void;
  onEdit: (announcement: Announcement) => void;
  onCopy: (announcement: Announcement) => void;
  /** Ends the running one, or deletes a scheduled one. Rejects with the reason to show. */
  onEnd: (announcement: Announcement) => Promise<void>;
  onDelete: (announcement: Announcement) => Promise<void>;
}

/** "Nov 26, 2026 to Dec 5, 2026". */
const daysOf = (announcement: Announcement) => `${formatAnnouncementDay(announcement.firstDay)} to ${formatAnnouncementDay(announcement.lastDay)}`;

/** The Announcements: showing now, scheduled (soonest first) and past (latest first), each with what can be done to it. */
export function AnnouncementList({ list, openId, onNew, onEdit, onCopy, onEnd, onDelete }: Props) {
  const group = (label: string, testId: string, items: Announcement[], empty: string) => (
    <section className="ann-group" aria-label={label} data-testid={testId}>
      <h3 className="ann-group__label">{label}</h3>
      {items.length === 0 ? (
        <p className="ann-group__empty">{empty}</p>
      ) : (
        items.map((announcement) => (
          <AnnouncementCard
            key={announcement.id}
            announcement={announcement}
            open={announcement.id === openId}
            onEdit={onEdit}
            onCopy={onCopy}
            onEnd={onEnd}
            onDelete={onDelete}
          />
        ))
      )}
    </section>
  );

  return (
    <aside className="ann-list" aria-labelledby="ann-list-title">
      <div className="ann-list__head">
        <h2 className="ann-list__title" id="ann-list-title">
          Announcements
        </h2>
        <button className="button button--small" type="button" onClick={onNew}>
          New
        </button>
      </div>
      <p className="ann-list__note">One shows on Home at a time. Later ones wait their turn.</p>
      {list === undefined ? (
        <p className="ann-group__empty" role="status">
          Loading...
        </p>
      ) : (
        <>
          {group("Showing now", "ann-running", list.running ? [list.running] : [], "Nothing is showing on Home.")}
          {group("Scheduled", "ann-scheduled", list.scheduled, "Nothing is scheduled.")}
          {group("Past", "ann-past", list.past, "None yet.")}
        </>
      )}
    </aside>
  );
}

interface CardProps {
  announcement: Announcement;
  open: boolean;
  onEdit: Props["onEdit"];
  onCopy: Props["onCopy"];
  onEnd: Props["onEnd"];
  onDelete: Props["onDelete"];
}

type Step = { kind: "idle" } | { kind: "confirm" } | { kind: "working" } | { kind: "refused"; message: string };

/** One Announcement in the list. End now and Delete cannot be undone, so each asks once more. */
function AnnouncementCard({ announcement, open, onEdit, onCopy, onEnd, onDelete }: CardProps) {
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const running = announcement.status === "running";

  async function confirm() {
    setStep({ kind: "working" });
    try {
      await (running ? onEnd : onDelete)(announcement);
    } catch (error) {
      setStep({ kind: "refused", message: error instanceof ApiError ? error.message : GENERIC_ERROR_MESSAGE });
    }
  }

  return (
    <article className={`ann-card${announcement.status === "past" ? " ann-card--past" : ""}${open ? " ann-card--open" : ""}`} aria-label={announcement.title}>
      <img className="ann-card__thumb" src={announcement.image.bannerUrl} alt="" />
      <div className="ann-card__info">
        <span className="ann-card__title">{announcement.title}</span>
        <span className="ann-card__days">{daysOf(announcement)}</span>
        {step.kind === "confirm" || step.kind === "working" ? (
          <div className="ann-card__ask" role="group" aria-label={running ? "Confirm ending it" : "Confirm deleting it"}>
            <span>{running ? "End it now? Members stop seeing it at once." : "Delete it? This cannot be undone."}</span>
            <div className="ann-card__actions">
              <button className="chip-button" type="button" disabled={step.kind === "working"} onClick={() => setStep({ kind: "idle" })}>
                Keep it
              </button>
              <button className="chip-button chip-button--danger chip-button--solid" type="button" disabled={step.kind === "working"} onClick={() => void confirm()}>
                {running ? "Yes, end it" : "Yes, delete it"}
              </button>
            </div>
          </div>
        ) : (
          <div className="ann-card__actions">
            {announcement.status === "past" ? (
              <button className="chip-button" type="button" onClick={() => onCopy(announcement)}>
                Copy as new
              </button>
            ) : (
              <>
                <button className="chip-button" type="button" onClick={() => onEdit(announcement)}>
                  Edit
                </button>
                <button className="chip-button chip-button--danger" type="button" onClick={() => setStep({ kind: "confirm" })}>
                  {running ? "End now" : "Delete"}
                </button>
              </>
            )}
          </div>
        )}
        {step.kind === "refused" && (
          <p className="form-help form-help--error" role="alert">
            {step.message}
          </p>
        )}
      </div>
    </article>
  );
}
