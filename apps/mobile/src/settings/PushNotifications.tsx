import { PUSH_MESSAGES } from "@libras/shared";
import type { PushKind, PushSettings } from "@libras/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import { pushPermission } from "../push/push-device";
import { colors, fontFamily, fontSize, lineHeightFor, radii, spacing } from "../theme/tokens";
import { SectionLabel, SettingsGroup, SettingsNote, SettingsSwitchRow } from "./SettingsParts";

/** The four switches, in the preview's order and words. */
const SWITCHES: readonly { kind: PushKind; label: string; detail: string }[] = [
  { kind: "holdReady", label: "Hold ready for pickup", detail: "So you don't miss your Pickup Window" },
  { kind: "loanDueTomorrow", label: "Loan due tomorrow", detail: "The day before it is due" },
  { kind: "loanOverdue", label: "Loan overdue", detail: "Once, on the first day" },
  { kind: "announcement", label: "Announcements", detail: "When the library posts one" },
];

type Loaded = { status: "loading" } | { status: "error" } | { status: "loaded"; settings: PushSettings };

/**
 * The Push notifications section of Settings (approved Tier 3 preview): one
 * switch per kind, saved by the API at once, and the line that Loan notice
 * emails are always sent. A switch moves as soon as it is tapped; if the API
 * does not take the change it moves back and `onMessage` says so.
 *
 * When the phone blocks notifications from LIBRAS, a line says so with a way
 * to the phone's settings: the switches alone would change nothing.
 */
export function PushNotificationsSection({ onMessage }: { onMessage: (message: string) => void }) {
  const { request } = useAuth();
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [blocked, setBlocked] = useState(false);
  const live = useRef(true);

  const load = useCallback(async () => {
    setLoaded({ status: "loading" });
    try {
      const { settings } = await request((accessToken) => api.getPushSettings(accessToken));
      if (live.current) setLoaded({ status: "loaded", settings });
    } catch {
      if (live.current) setLoaded({ status: "error" });
    }
  }, [request]);

  useEffect(() => {
    live.current = true;
    void load();
    return () => {
      live.current = false;
    };
  }, [load]);

  // Read again whenever the app comes back, as the Member may have changed it in the phone's settings.
  useEffect(() => {
    const check = () =>
      void pushPermission().then((permission) => {
        if (live.current) setBlocked(permission === "blocked");
      });
    check();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => subscription.remove();
  }, []);

  const change = (kind: PushKind, on: boolean) => {
    const flip = (value: boolean) =>
      setLoaded((current) => (current.status === "loaded" ? { status: "loaded", settings: { ...current.settings, [kind]: value } } : current));
    flip(on);
    request((accessToken) => api.changePushSettings(accessToken, { [kind]: on })).catch(() => {
      if (!live.current) return;
      flip(!on);
      onMessage(PUSH_MESSAGES.saveFailed);
    });
  };

  return (
    <>
      <SectionLabel>Push notifications</SectionLabel>
      {loaded.status === "loaded" ? (
        <SettingsGroup>
          {SWITCHES.map(({ kind, label, detail }) => (
            <SettingsSwitchRow
              key={kind}
              label={label}
              detail={detail}
              on={loaded.settings[kind]}
              onChange={(on) => change(kind, on)}
              testID={`settings-push-${kind}`}
            />
          ))}
        </SettingsGroup>
      ) : (
        <View style={styles.placeholder} testID="settings-push-placeholder">
          {loaded.status === "loading" ? (
            <ActivityIndicator color={colors.textMuted} testID="settings-push-loading" />
          ) : (
            <>
              <Text style={styles.placeholderText}>{PUSH_MESSAGES.loadFailed}</Text>
              <Pressable accessibilityRole="button" onPress={() => void load()} hitSlop={8} testID="settings-push-retry">
                <Text style={styles.retry}>Try again</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
      {blocked ? (
        <SettingsNote testID="settings-push-blocked">
          {PUSH_MESSAGES.blocked}{" "}
          <Text style={styles.link} accessibilityRole="link" onPress={() => void Linking.openSettings()}>
            Open phone settings
          </Text>
        </SettingsNote>
      ) : null}
      <SettingsNote testID="settings-push-note">{PUSH_MESSAGES.emailsAlwaysSent}</SettingsNote>
    </>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.option,
  },
  placeholderText: {
    textAlign: "center",
    fontFamily: fontFamily.regular,
    fontSize: fontSize.resultNote,
    lineHeight: lineHeightFor(fontSize.resultNote),
    color: colors.textMuted,
  },
  retry: { fontFamily: fontFamily.semiBold, fontSize: fontSize.label, lineHeight: lineHeightFor(fontSize.label), color: colors.primary },
  link: { fontFamily: fontFamily.semiBold, color: colors.primary },
});
