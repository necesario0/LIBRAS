import { useState } from "react";
import type { ChangeEvent } from "react";
import { ANNOUNCEMENT_BODY_MAX_LENGTH, ANNOUNCEMENT_MESSAGES, ANNOUNCEMENT_TITLE_MAX_LENGTH, ANNOUNCEMENT_URL_MAX_LENGTH } from "@libras/shared";
import type { DeskAnnouncementsResponse, LibraryDay, StaffProfile } from "@libras/shared";
import { bannerStyle, checkDraft, fileProblem, imageSize, linkButtonLabel } from "../announcements/draft.ts";
import type { Draft, LinkKind } from "../announcements/draft.ts";
import { BookPicker } from "./BookPicker.tsx";
import { CropFrame } from "./CropFrame.tsx";

interface Props {
  draft: Draft;
  onChange: (draft: Draft) => void;
  list: DeskAnnouncementsResponse | undefined;
  today: LibraryDay;
  staff: StaffProfile;
  /** The API's refusal of the last save, shown in place of the form's own check. */
  refusal: string | undefined;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  onSessionEnded: () => void;
}

const LINK_KINDS: [LinkKind, string][] = [
  ["none", "No link"],
  ["book", "A Book"],
  ["web", "A web page"],
];

/**
 * The Announcement form: the poster with its 2:1 crop frame, title, text, the
 * one link, the dates, and what is wrong or what saving will do. Beside it, the
 * banner as Home shows it and the full poster as the app opens it.
 */
export function AnnouncementForm({ draft, onChange, list, today, staff, refusal, saving, onSave, onCancel, onSessionEnded }: Props) {
  const [fileRefusal, setFileRefusal] = useState<string | undefined>(undefined);
  const set = (change: Partial<Draft>) => {
    setFileRefusal(undefined);
    onChange({ ...draft, ...change, pristine: false });
  };
  const check = checkDraft(draft, list, today);
  const shown = fileRefusal ?? refusal ?? (draft.pristine ? undefined : check.message);
  const bad = fileRefusal !== undefined || refusal !== undefined || !check.ok;
  const linkLabel = linkButtonLabel(draft);
  const startsToday = draft.firstDay !== "" && draft.firstDay <= today;
  const saveLabel = draft.editing ? "Save changes" : startsToday ? "Publish now" : "Schedule";

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const problem = fileProblem(file);
    if (problem) {
      setFileRefusal(problem);
      return;
    }
    const src = URL.createObjectURL(file);
    try {
      const { width, height } = await imageSize(src);
      set({ image: { src, width, height, file }, cropPosition: 0.5 });
    } catch {
      URL.revokeObjectURL(src);
      setFileRefusal(ANNOUNCEMENT_MESSAGES.imageUnreadable);
    }
  }

  return (
    <section className="ann-form" aria-labelledby="ann-form-title">
      <h2 className="ann-form__title" id="ann-form-title">
        {draft.editing ? "Edit Announcement" : "New Announcement"}
      </h2>
      <form
        className="ann-form__body"
        onSubmit={(event) => {
          event.preventDefault();
          if (!bad && !saving) onSave();
          else set({});
        }}
      >
        <div className="ann-form__steps">
          <div className="ann-form__fields">
            <div className="form-field">
              <span className="form-label" id="poster-label">
                Poster image
              </span>
              <div className="crop-box">
                {draft.image ? (
                  <CropFrame image={draft.image} position={draft.cropPosition} onChange={(cropPosition) => set({ cropPosition })} />
                ) : (
                  <div className="crop crop--empty">No poster yet</div>
                )}
                <div className="upload">
                  <span className="form-help">JPG, PNG or WebP, up to 5 MB. Drag the frame to choose what shows on Home.</span>
                  <label className="button button--quiet button--small upload__button">
                    {draft.image ? "Replace image" : "Choose image"}
                    <input className="upload__input" type="file" accept="image/jpeg,image/png,image/webp" aria-labelledby="poster-label" onChange={(event) => void choose(event)} />
                  </label>
                </div>
              </div>
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="ann-title">
                Title
              </label>
              <input
                id="ann-title"
                className="text-input"
                type="text"
                maxLength={ANNOUNCEMENT_TITLE_MAX_LENGTH}
                value={draft.title}
                onChange={(event) => set({ title: event.target.value })}
              />
              <span className="form-help">Required. Read aloud by screen readers and shown above the poster when opened. Not drawn on the banner.</span>
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="ann-body">
                Text <span className="form-help">(optional)</span>
              </label>
              <textarea
                id="ann-body"
                className="text-input text-input--area"
                maxLength={ANNOUNCEMENT_BODY_MAX_LENGTH}
                value={draft.body}
                onChange={(event) => set({ body: event.target.value })}
              />
            </div>
            <div className="form-field">
              <span className="form-label" id="ann-link-label">
                Link <span className="form-help">(optional)</span>
              </span>
              <div className="segmented" role="radiogroup" aria-labelledby="ann-link-label">
                {LINK_KINDS.map(([kind, label]) => (
                  <button
                    key={kind}
                    className="segmented__option"
                    type="button"
                    role="radio"
                    aria-checked={draft.linkKind === kind}
                    onClick={() => set({ linkKind: kind, webUrl: kind === "web" && draft.webUrl === "" ? "https://" : draft.webUrl })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {draft.linkKind === "book" && (
                <>
                  <BookPicker book={draft.book} onChange={(book) => set({ book })} onSessionEnded={onSessionEnded} />
                  <span className="form-help">Adds a View book button under the poster.</span>
                </>
              )}
              {draft.linkKind === "web" && (
                <>
                  <input
                    className="text-input"
                    type="url"
                    aria-label="Web address"
                    placeholder="https://"
                    maxLength={ANNOUNCEMENT_URL_MAX_LENGTH}
                    value={draft.webUrl}
                    onChange={(event) => set({ webUrl: event.target.value })}
                  />
                  <span className="form-help">Adds an Open button that names the site. It opens in the Member's own browser. https addresses only.</span>
                </>
              )}
            </div>
            <div className="ann-form__dates">
              <div className="form-field">
                <label className="form-label" htmlFor="ann-first-day">
                  Show from
                </label>
                <input
                  id="ann-first-day"
                  className="text-input"
                  type="date"
                  min={draft.editing?.status === "running" ? undefined : today}
                  value={draft.firstDay}
                  onChange={(event) => set({ firstDay: event.target.value })}
                />
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="ann-last-day">
                  Until
                </label>
                <input
                  id="ann-last-day"
                  className="text-input"
                  type="date"
                  min={draft.firstDay || today}
                  value={draft.lastDay}
                  onChange={(event) => set({ lastDay: event.target.value })}
                />
              </div>
            </div>
            {shown !== undefined && (
              <p className={bad ? "alert" : "ok-message"} role={bad ? "alert" : "status"} data-testid="ann-check">
                {shown}
              </p>
            )}
          </div>
          <div className="ann-form__preview" aria-label="Preview">
            <span className="form-kicker">On Home</span>
            <div className="mini-phone" aria-hidden="true">
              <div className="mini-phone__hello">
                <i className="mini-phone__avatar" />
                Hi, {staff.fullName.split(" ")[0]}
              </div>
              <div className="mini-phone__line" />
              <div className="mini-phone__banner" data-testid="home-banner-preview" style={draft.image ? bannerStyle(draft.image, draft.cropPosition) : undefined} />
              <div className="mini-phone__line mini-phone__line--short" />
              <div className="mini-phone__line" />
            </div>
            <span className="form-kicker">When opened</span>
            <div className="mini-phone mini-phone--detail" aria-hidden="true">
              {draft.image ? <img className="mini-phone__poster" src={draft.image.src} alt="" /> : <div className="mini-phone__poster mini-phone__poster--empty" />}
              <b className="mini-phone__title">{draft.title.trim() || "Untitled"}</b>
              {draft.body.trim() && <span className="mini-phone__text">{draft.body.trim()}</span>}
              <span className="form-help">Full poster, never cropped.</span>
              {linkLabel && <span className="mini-phone__link">{linkLabel}</span>}
            </div>
          </div>
        </div>
        <div className="ann-form__actions">
          <span className="form-help ann-form__audit">Saved changes are recorded in the audit log.</span>
          <button className="button button--quiet" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="button" type="submit" disabled={saving || (bad && !draft.pristine)}>
            {saving ? "Saving..." : saveLabel}
          </button>
        </div>
      </form>
    </section>
  );
}
