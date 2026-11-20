import { useEffect } from "react";
import type { AccountType } from "@libras/shared";
import { useAuth } from "../auth/AuthContext";
import { SaveButton } from "./SaveButton";
import { useSaveToggle } from "./useSaveToggle";

interface SaveActionProps {
  bookId: string;
  accountType: AccountType;
  /** Whether the Member had saved the Book when the page opened. */
  initiallySaved: boolean;
  /** A short message for the foot of the page: what changed, or why it did not. */
  onMessage: (message: string) => void;
}

/** What the page says after a change: all Account Types now have My Books. */
export function savedMessage(saved: boolean, _accountType: AccountType): string {
  return saved ? "Saved to My Books" : "Removed from Saved";
}

/** The Save button of the Book page and what it does: toggles the Book in the Member's Saved books. */
export function SaveAction({ bookId, accountType, initiallySaved, onMessage }: SaveActionProps) {
  const { request } = useAuth();
  const { saved, failure, toggle } = useSaveToggle(request, bookId, initiallySaved);

  useEffect(() => {
    if (failure !== undefined) onMessage(failure);
  }, [failure, onMessage]);

  const press = async () => {
    const result = await toggle();
    if (result !== undefined) onMessage(savedMessage(result, accountType));
  };

  return <SaveButton saved={saved} onPress={() => void press()} />;
}
