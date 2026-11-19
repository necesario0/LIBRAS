import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../components/Button";
import { colors, fontFamily, fontSize, lineHeightFor, radii, spacing } from "../theme/tokens";

const RING = 64;

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  /** The one line under the title. */
  line: string;
  testID: string;
}

/**
 * What a segment of My Books says when it has nothing (approved Tier 3
 * preview): a ring with an icon, a title, one line, and Search the catalog,
 * which opens search mode on Home.
 */
export function EmptyState({ icon, title, line, testID }: EmptyStateProps) {
  const router = useRouter();
  return (
    <View style={styles.empty} testID={testID}>
      <View style={styles.ring}>{icon}</View>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.line}>{line}</Text>
      <View style={styles.action}>
        <Button
          label="Search the catalog"
          radius={radii.formButton}
          onPress={() => router.navigate({ pathname: "/home", params: { search: "1" } })}
          testID={`${testID}-search`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", gap: 10, paddingTop: 48, paddingBottom: spacing.lg, paddingHorizontal: spacing.md },
  ring: { width: RING, height: RING, borderRadius: RING / 2, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  title: { marginTop: 4, fontFamily: fontFamily.semiBold, fontSize: fontSize.emptyTitle, lineHeight: lineHeightFor(fontSize.emptyTitle), color: colors.black },
  line: {
    maxWidth: 250,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.small,
    lineHeight: lineHeightFor(fontSize.small),
    color: colors.textMuted,
    textAlign: "center",
  },
  action: { alignSelf: "stretch", paddingHorizontal: spacing.xl, marginTop: 6 },
});
