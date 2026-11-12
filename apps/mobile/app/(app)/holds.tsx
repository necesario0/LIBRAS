import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isActiveHold } from "@libras/shared";
import type { Hold } from "@libras/shared";
import { useAuth } from "../../src/auth/AuthContext";
import { Button } from "../../src/components/Button";
import { ChevronBackIcon } from "../../src/components/icons";
import { holdFailureMessage, cancelHold, useHolds } from "../../src/holds/useHolds";
import { HoldRow } from "../../src/holds/HoldRow";
import { useScreenTop } from "../../src/hooks/useScreenTop";
import { colors, fontFamily, fontSize, radii, spacing } from "../../src/theme/tokens";

/**
 * The Member's Holds and each one's status (waiting, ready for pickup,
 * borrowed, expired, cancelled), with a Cancel button on a waiting Hold.
 * There is no Figma frame for it: it uses the style of Home and the Book page.
 */
export default function HoldsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenTop = useScreenTop();
  const { request } = useAuth();
  const { state, reload } = useHolds(request);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/home"));

  const cancel = async (hold: Hold) => {
    try {
      await cancelHold(request, hold.id);
    } catch (error) {
      // The Hold may have changed since the list was loaded: show the refusal, then the truth.
      void reload();
      throw new Error(holdFailureMessage(error, "Your Hold could not be cancelled. Please try again."), { cause: error });
    }
    await reload();
  };

  const active = state.status === "loaded" ? state.holds.filter((hold) => isActiveHold(hold.status)) : [];
  const past = state.status === "loaded" ? state.holds.filter((hold) => !isActiveHold(hold.status)) : [];

  return (
    <View style={[styles.screen, { paddingTop: screenTop }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} hitSlop={12} style={styles.back} testID="holds-back">
          <ChevronBackIcon />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          My Holds
        </Text>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {state.status === "loading" ? <ActivityIndicator color={colors.primary} style={styles.spinner} testID="holds-loading" /> : null}

        {state.status === "error" ? (
          <View style={[styles.panel, styles.failed]} testID="holds-error">
            <Text style={[styles.panelTitle, styles.failedTitle]} accessibilityRole="alert">
              Your Holds did not load
            </Text>
            <Text style={styles.panelBody}>{state.message}</Text>
            <Button label="Try again" radius={radii.formButton} onPress={() => void reload()} testID="holds-retry" />
          </View>
        ) : null}

        {state.status === "loaded" && state.holds.length === 0 ? (
          <View style={styles.panel} testID="holds-empty">
            <Text style={styles.panelTitle} accessibilityRole="header">
              No Holds yet
            </Text>
            <Text style={styles.panelBody}>
              When a Book has no available Copy, open it and place a Hold. You join the queue and see where you stand here.
            </Text>
          </View>
        ) : null}

        {active.length > 0 ? (
          <View testID="holds-active">
            <Text style={styles.section}>Active</Text>
            {active.map((hold) => (
              <HoldRow key={hold.id} hold={hold} onCancel={cancel} />
            ))}
          </View>
        ) : null}

        {past.length > 0 ? (
          <View testID="holds-past">
            <Text style={styles.section}>Past</Text>
            {past.map((hold) => (
              <HoldRow key={hold.id} hold={hold} onCancel={cancel} />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.home, paddingTop: 2 },
  back: { width: 40, height: 40, borderRadius: radii.button, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fontFamily.regular, fontSize: fontSize.title, letterSpacing: -1, color: colors.black },
  body: { flex: 1, marginTop: spacing.lg },
  content: { paddingHorizontal: spacing.home, gap: spacing.lg },
  spinner: { marginTop: spacing.xl },
  section: { fontFamily: fontFamily.semiBold, fontSize: fontSize.small, color: colors.textMuted },
  panel: { borderWidth: 1, borderColor: colors.panelBorder, borderRadius: radii.panel, padding: spacing.lg, gap: spacing.sm },
  failed: { borderColor: colors.error },
  panelTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.body, color: colors.black },
  failedTitle: { color: colors.danger },
  panelBody: { fontFamily: fontFamily.regular, fontSize: fontSize.label, color: colors.textSecondary, marginBottom: spacing.sm },
});
