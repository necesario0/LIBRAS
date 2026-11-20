/** The two legal documents shown in the mobile app's Terms and policies screen. */
export const POLICY_DOCUMENTS = ["terms", "privacy"] as const;

export type PolicyDocumentKind = (typeof POLICY_DOCUMENTS)[number];

/** Picks which policy document `/terms` opens from its route parameter. */
export function policyDocumentKind(value: string | string[] | undefined): PolicyDocumentKind {
  const first = Array.isArray(value) ? value[0] : value;
  return first === "privacy" ? "privacy" : "terms";
}
