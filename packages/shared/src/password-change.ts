import { z } from "zod";
import { passwordSchema } from "./sign-up.ts";

/** Change password: a signed-in Member sets a new password by proving the current one. */
export const PASSWORD_CHANGE_MESSAGES = {
  /** Also the text of the red state of Current Password in the Figma frame (926:14542). */
  currentPasswordIncorrect: "Current password is incorrect.",
  samePassword: "Your new password must be different from your current password.",
} as const;

/**
 * The body of `PUT /members/me/password`. The current password is not held to
 * the sign-up rules: it is whatever the Member set, possibly under older rules,
 * and is only compared with the real one. The new password follows the sign-up rules.
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.input<typeof changePasswordSchema>;
