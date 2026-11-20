import { ACCOUNT_DELETION_MESSAGES, notClearedNotice } from "@libras/shared";
import type { NotClearedNotice } from "@libras/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { api } from "../api";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { TrashIcon } from "../components/OutlineIcons";
import { PasswordField } from "../password/PasswordField";
import { colors } from "../theme/tokens";
import { SectionLabel, SettingsGroup, SettingsRow } from "./SettingsParts";

/** Which dialog is open, or Clearance being read before one opens. */
type Open = "none" | "checking" | "notCleared" | "confirm";

/** What stands in the way of a Member who is not cleared. Kept after the dialog closes, so it fades out whole. */
interface InTheWay {
  notice: NotClearedNotice;
  loansOut: boolean;
}

const SOMETHING_WRONG = "Something went wrong. Please try again.";

/**
 * The Account section of Settings (approved Tier 3 preview): Delete my account,
 * the last row, in red. Tapping it reads the Member's Clearance first.
 *
 * - Not cleared: "Return your books first" (or "Settle your Fines first") names
 *   what stands in the way, with Close and a way to it: My Loans, or Clearance
 *   on Profile when only Fines are left.
 * - Cleared: "Delete your account?" asks for the password. The API checks the
 *   password and Clearance again, deletes the account and ends every session;
 *   the app then forgets this phone's session and returns to sign-in. A wrong
 *   password, or too many, keeps the dialog open with the API's message.
 *
 * `onMessage` shows a short message on the Settings screen (Clearance could not be read).
 */
export function DeleteAccountSection({ onMessage }: { onMessage: (message: string) => void }) {
  const router = useRouter();
  const { request, signOut } = useAuth();
  const [open, setOpen] = useState<Open>("none");
  const [inTheWay, setInTheWay] = useState<InTheWay>({ notice: { title: "", message: "" }, loansOut: false });
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  /** A wrong or missing password: shown under the field, which turns red. */
  const [passwordError, setPasswordError] = useState<string | undefined>();
  /** Anything else that stopped the deletion, such as too many attempts or no connection. */
  const [error, setError] = useState<string | undefined>();

  async function start() {
    setOpen("checking");
    try {
      const { clearance } = await request((accessToken) => api.getClearance(accessToken));
      if (clearance.cleared) {
        setPassword("");
        setPasswordError(undefined);
        setError(undefined);
        setOpen("confirm");
      } else {
        setInTheWay({ notice: notClearedNotice(clearance), loansOut: clearance.loansOut.length > 0 });
        setOpen("notCleared");
      }
    } catch (failure) {
      setOpen("none");
      onMessage(failure instanceof ApiError ? failure.message : SOMETHING_WRONG);
    }
  }

  async function deleteAccount() {
    if (password === "") {
      setPasswordError(ACCOUNT_DELETION_MESSAGES.invalidRequest);
      return;
    }
    setDeleting(true);
    setPasswordError(undefined);
    setError(undefined);
    try {
      await request((accessToken) => api.deleteAccount(accessToken, { password }));
    } catch (failure) {
      setDeleting(false);
      if (failure instanceof ApiError && failure.code === "password_incorrect") setPasswordError(failure.message);
      else setError(failure instanceof ApiError ? failure.message : SOMETHING_WRONG);
      return;
    }
    // The account and every session are gone: forget this phone's session (and its search history) and return to sign-in.
    await signOut();
  }

  const close = () => setOpen("none");
  const seeWhatIsInTheWay = () => {
    close();
    if (inTheWay.loansOut) router.dismissTo({ pathname: "/my-books", params: { segment: "loans" } });
    else router.dismissTo("/profile");
  };

  return (
    <>
      <SectionLabel>Account</SectionLabel>
      <SettingsGroup>
        <SettingsRow
          icon={<TrashIcon color={colors.danger} size={20} />}
          label="Delete my account"
          tone="danger"
          disabled={open === "checking"}
          onPress={() => void start()}
          testID="settings-delete-account"
        />
      </SettingsGroup>

      <ConfirmDialog
        visible={open === "notCleared"}
        title={inTheWay.notice.title}
        message={inTheWay.notice.message}
        cancelLabel="Close"
        confirmLabel={inTheWay.loansOut ? "See My Loans" : "See Clearance"}
        onCancel={close}
        onConfirm={seeWhatIsInTheWay}
        testID="delete-not-cleared-dialog"
      />

      <ConfirmDialog
        visible={open === "confirm"}
        title="Delete your account?"
        message="Your profile, Saved books and sign-in are deleted for good. The library keeps your past Loans and Fines without your name."
        confirmLabel="Delete account"
        tone="danger"
        busy={deleting}
        error={error}
        onCancel={close}
        onConfirm={() => void deleteAccount()}
        testID="delete-account-dialog"
      >
        <PasswordField
          label="Password"
          labelHidden
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setPasswordError(undefined);
          }}
          placeholder="Enter your password to confirm"
          autoComplete="current-password"
          error={passwordError}
          returnKeyType="done"
          onSubmitEditing={() => void deleteAccount()}
          testID="delete-account-password"
        />
      </ConfirmDialog>
    </>
  );
}
