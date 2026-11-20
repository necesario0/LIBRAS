import { useEffect, useState } from "react";
import type { StaffProfile } from "@libras/shared";
import { currentStaff, signOut } from "./api.ts";
import type { DeskPageName } from "./components/DeskBar.tsx";
import { AnnouncementsPage } from "./pages/AnnouncementsPage.tsx";
import { DeskPage } from "./pages/DeskPage.tsx";
import { SignInPage } from "./pages/SignInPage.tsx";

/** `undefined` while the stored session is being checked, `null` when nobody is signed in. */
type Who = StaffProfile | null | undefined;

/** The page the address names: `#announcements`, or the desk. */
function pageOf(hash: string): DeskPageName {
  return hash === "#announcements" ? "announcements" : "desk";
}

export function App() {
  const [staff, setStaff] = useState<Who>(undefined);
  const [page, setPage] = useState<DeskPageName>(() => pageOf(window.location.hash));

  // The bar's links change the address; the back button works between the pages.
  useEffect(() => {
    const follow = () => setPage(pageOf(window.location.hash));
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);

  useEffect(() => {
    let current = true;
    currentStaff().then(
      (found) => {
        if (current) setStaff(found ?? null);
      },
      () => {
        if (current) setStaff(null);
      },
    );
    return () => {
      current = false;
    };
  }, []);

  if (staff === undefined) {
    return (
      <div className="page-message" role="status">
        Loading...
      </div>
    );
  }
  if (staff === null) return <SignInPage onSignedIn={setStaff} />;
  const leave = async () => {
    await signOut();
    setStaff(null);
  };
  return page === "announcements" ? <AnnouncementsPage staff={staff} onSignOut={leave} /> : <DeskPage staff={staff} onSignOut={leave} />;
}
