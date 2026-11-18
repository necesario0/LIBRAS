import type { StaffProfile } from "@libras/shared";
import { Brand } from "./Brand.tsx";

/** The Librarian pages behind sign-in, in the order the bar lists them. */
export const DESK_PAGES = [
  { page: "desk", label: "Desk", hash: "" },
  { page: "announcements", label: "Announcements", hash: "#announcements" },
] as const;
export type DeskPageName = (typeof DESK_PAGES)[number]["page"];

interface Props {
  staff: StaffProfile;
  current: DeskPageName;
  onSignOut: () => void;
}

/** The bar on top of every Librarian page: the brand, the pages, and who is signed in. */
export function DeskBar({ staff, current, onSignOut }: Props) {
  return (
    <header className="desk__bar">
      <div className="desk__start">
        <Brand />
        <nav className="desk__nav" aria-label="Librarian pages">
          {DESK_PAGES.map(({ page, label, hash }) => (
            <a key={page} className="desk__nav-link" href={hash === "" ? "#" : hash} aria-current={page === current ? "page" : undefined}>
              {label}
            </a>
          ))}
        </nav>
      </div>
      <div className="desk__who">
        <div className="desk__name">
          <span>{staff.fullName}</span>
          <span className="desk__role">Librarian</span>
        </div>
        <button className="button button--quiet" type="button" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </header>
  );
}
