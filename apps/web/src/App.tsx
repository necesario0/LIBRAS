import { useEffect, useState } from "react";
import type { StaffProfile } from "@libras/shared";
import { currentStaff, signOut } from "./api.ts";
import { DeskPage } from "./pages/DeskPage.tsx";
import { SignInPage } from "./pages/SignInPage.tsx";

/** `undefined` while the stored session is being checked, `null` when nobody is signed in. */
type Who = StaffProfile | null | undefined;

export function App() {
  const [staff, setStaff] = useState<Who>(undefined);

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
  return (
    <DeskPage
      staff={staff}
      onSignOut={async () => {
        await signOut();
        setStaff(null);
      }}
    />
  );
}
