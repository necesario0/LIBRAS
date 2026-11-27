import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { goodStandingNotice } from "@libras/shared";
import type { GoodStandingRefusal } from "@libras/shared";
import { colors, fontFamily, fontSize, lineHeightFor, radii, spacing } from "../theme/tokens";

interface StandingNoticeProps {
  /** What is blocked where the notice shows: "You can’t borrow right now". */
  title: string;
  /** Why the Member is not in Good standing, as the API says. */
  reasons: readonly GoodStandingRefusal[];
  /**
   * How the screen reaches the Loan or Fine in the way. A tab screen
   * (`navigate`) switches tab; a screen pushed over the tabs (`dismissTo`)
   * closes itself first.
   */
  from: "tab" | "pushed";
  /** Drawn on a white panel with a red outline (Home), or filled pale red where it replaces an action (Book page, Digital ID). */
  outlined?: boolean;
  testID?: string;
}

/**
 * The notice for a Member who is not in Good standing, one component for every
 * place it shows (Home, the Book page and the Digital ID), so the Member meets
 * the same red card before the desk wherever they look. Under its heading it
 * gives the reason and what to do in the words the API and Profile use
 * (`goodStandingNotice`), then a way to what is in the way: the Borrow segment
 * of My Books (the Loans) for an overdue Loan, the Clearance panel on Profile for a Fine.
 */
export function StandingNotice({ title, reasons, from, outlined = false, testID }: StandingNoticeProps) {
  const router = useRouter();
  const overdue = reasons.includes("overdue_loan");
  const action = overdue
    ? { label: "See what I borrowed", go: { pathname: "/my-books", params: { segment: "loans" } } as const }
    : { label: "See Clearance", go: "/profile" as const };
  const open = () => (from === "tab" ? router.navigate(action.go) : router.dismissTo(action.go));

  return (
    <View style={[styles.card, outlined && styles.outlined]} accessibilityRole="alert" testID={testID}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{goodStandingNotice(reasons)}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={open}
        hitSlop={6}
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        testID={testID === undefined ? undefined : `${testID}-action`}
      >
        <Text style={styles.actionLabel}>{action.label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.dangerSurface, borderRadius: radii.panel, padding: spacing.md, gap: spacing.xs },
  outlined: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.error },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.note, lineHeight: lineHeightFor(fontSize.note), color: colors.danger },
  body: { fontFamily: fontFamily.medium, fontSize: fontSize.small, lineHeight: lineHeightFor(fontSize.small) + 2, color: colors.danger },
  action: {
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radii.segment,
    borderWidth: 1.5,
    borderColor: colors.danger,
  },
  pressed: { opacity: 0.7 },
  actionLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.small, lineHeight: lineHeightFor(fontSize.small), color: colors.danger },
});
