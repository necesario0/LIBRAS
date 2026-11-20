import { useCallback, useEffect, useState } from "react";
import { formatAnnouncementDay, libraryDayOf } from "@libras/shared";
import type { Announcement, DeskAnnouncementsResponse, StaffProfile } from "@libras/shared";
import { ApiError, GENERIC_ERROR_MESSAGE, deleteAnnouncement, endAnnouncement, listAnnouncements, saveAnnouncement } from "../api.ts";
import { detailsOf, draftFrom, imageSize, newDraft } from "../announcements/draft.ts";
import type { Draft } from "../announcements/draft.ts";
import { AnnouncementForm } from "../components/AnnouncementForm.tsx";
import { AnnouncementList } from "../components/AnnouncementList.tsx";
import { DeskBar } from "../components/DeskBar.tsx";

interface Props {
  staff: StaffProfile;
  onSignOut: () => void;
}

/** A line over the form about what just happened. */
type Notice = { kind: "ok"; message: string } | { kind: "error"; message: string } | undefined;

const messageOf = (error: unknown) => (error instanceof ApiError ? error.message : GENERIC_ERROR_MESSAGE);

/** What the Librarian is told after a save. */
function savedMessage(announcement: Announcement): string {
  const days = `${formatAnnouncementDay(announcement.firstDay)} to ${formatAnnouncementDay(announcement.lastDay)}`;
  return announcement.status === "running"
    ? `“${announcement.title}” is showing on every Member's Home now, until ${formatAnnouncementDay(announcement.lastDay)}.`
    : `“${announcement.title}” is scheduled for ${days}.`;
}

/**
 * The Announcements page: the list (showing now, scheduled, past) beside the
 * form that creates or edits one. Copy as new fills the form from a past one,
 * poster included, with no dates.
 */
export function AnnouncementsPage({ staff, onSignOut }: Props) {
  const [list, setList] = useState<DeskAnnouncementsResponse | undefined>(undefined);
  const [draft, setDraft] = useState<Draft>(newDraft);
  const [refusal, setRefusal] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(undefined);
  // The library's day, for the date checks. Read again on each render: the page may stay open past midnight.
  const today = libraryDayOf(new Date());

  const reload = useCallback(async () => {
    try {
      const found = await listAnnouncements();
      if (found === undefined) onSignOut();
      else setList(found);
    } catch (error) {
      setNotice({ kind: "error", message: messageOf(error) });
    }
  }, [onSignOut]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function open(next: Draft) {
    setDraft(next);
    setRefusal(undefined);
    setNotice(undefined);
  }

  async function copyAsNew(announcement: Announcement) {
    // The poster is copied from its public address and sent again as the new one's.
    try {
      const response = await fetch(announcement.image.posterUrl);
      if (!response.ok) throw new Error(`poster ${response.status}`);
      const file = await response.blob();
      const src = URL.createObjectURL(file);
      const { width, height } = await imageSize(src);
      open(draftFrom(announcement, { image: { src, width, height, file } }));
    } catch {
      setNotice({ kind: "error", message: "The poster of that Announcement could not be loaded. Check your connection and try again." });
    }
  }

  async function save() {
    setSaving(true);
    try {
      const saved = await saveAnnouncement(draft.editing?.id, detailsOf(draft), draft.image?.file);
      if (saved === undefined) {
        onSignOut();
        return;
      }
      setDraft(newDraft());
      setRefusal(undefined);
      setNotice({ kind: "ok", message: savedMessage(saved) });
      await reload();
    } catch (error) {
      setRefusal(messageOf(error));
      // Another desk may have changed the list: what is in the way shows on the next check too.
      void reload();
    } finally {
      setSaving(false);
    }
  }

  async function act(run: (id: string) => Promise<boolean>, announcement: Announcement, done: string) {
    try {
      if (!(await run(announcement.id))) {
        onSignOut();
        return;
      }
    } finally {
      // Whatever happened, show the list as it now is.
      await reload();
    }
    if (draft.editing?.id === announcement.id) setDraft(newDraft());
    setNotice({ kind: "ok", message: done });
  }

  return (
    <div className="desk">
      <DeskBar staff={staff} current="announcements" onSignOut={onSignOut} />
      <main className="ann-page">
        <AnnouncementList
          list={list}
          openId={draft.editing?.id}
          onNew={() => open(newDraft())}
          onEdit={(announcement) => open(draftFrom(announcement))}
          onCopy={(announcement) => void copyAsNew(announcement)}
          onEnd={(announcement) => act(endAnnouncement, announcement, `“${announcement.title}” has ended. Members no longer see it.`)}
          onDelete={(announcement) => act(deleteAnnouncement, announcement, `“${announcement.title}” was deleted.`)}
        />
        <div className="ann-page__main">
          {notice && (
            <p className={notice.kind === "ok" ? "ok-message" : "alert"} role={notice.kind === "ok" ? "status" : "alert"} data-testid="ann-notice">
              {notice.message}
            </p>
          )}
          <AnnouncementForm
            key={draft.editing?.id ?? "new"}
            draft={draft}
            onChange={(next) => {
              setDraft(next);
              setRefusal(undefined);
            }}
            list={list}
            today={today}
            staff={staff}
            refusal={refusal}
            saving={saving}
            onSave={() => void save()}
            onCancel={() => open(newDraft())}
            onSessionEnded={onSignOut}
          />
        </div>
      </main>
    </div>
  );
}
