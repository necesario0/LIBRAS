import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../../src/api";
import { ApiError } from "../../src/api/client";
import { useAuth, useMember } from "../../src/auth/AuthContext";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { DevicesIcon, HistoryIcon, PinIcon } from "../../src/components/OutlineIcons";
import { useScreenTop } from "../../src/hooks/useScreenTop";
import { PushedHeader } from "../../src/navigation/PushedHeader";
import { clearRecentSearches, loadRecentSearches } from "../../src/search/recent-searches-store";
import { DeleteAccountSection } from "../../src/settings/DeleteAccount";
import { PushNotificationsSection } from "../../src/settings/PushNotifications";
import { SectionLabel, SettingsGroup, SettingsRow } from "../../src/settings/SettingsParts";
import { colors, fontFamily, fontSize, radii, spacing } from "../../src/theme/tokens";

const ICON = 20;
const TOAST_MS = 2500;

/**
 * Settings (approved Tier 3 preview): Push notifications (a switch per kind,
 * `PushNotificationsSection`), Privacy and security (Clear search history,
 * Sign out of all devices), Library (Library info), Account (Delete my
 * account, `DeleteAccountSection`) and the app version at the foot.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const member = useMember();
  const { request, signOut } = useAuth();
  const screenTop = useScreenTop();
  const [recentCount, setRecentCount] = useState<number | undefined>();
  const [toast, setToast] = useState<string | undefined>();
  const [confirmingSignOutAll, setConfirmingSignOutAll] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);
  const [signOutAllError, setSignOutAllError] = useState<string | undefined>();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void loadRecentSearches(member.id).then((searches) => {
      if (live) setRecentCount(searches.length);
    });
    return () => {
      live = false;
      clearTimeout(toastTimer.current);
    };
  }, [member.id]);

  const showToast = useCallback((message: string) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(undefined), TOAST_MS);
  }, []);

  async function clearHistory() {
    await clearRecentSearches();
    setRecentCount(0);
    showToast("Search history cleared");
  }

  async function signOutEverywhere() {
    setSigningOutAll(true);
    setSignOutAllError(undefined);
    try {
      await request((accessToken) => api.signOutAllDevices(accessToken));
    } catch (failure) {
      // A session that is already gone is what the Member asked for: go on to sign-in. Anything else: nothing changed.
      if (!(failure instanceof ApiError && failure.status === 401)) {
        setSigningOutAll(false);
        setSignOutAllError(failure instanceof ApiError ? failure.message : "Something went wrong. Please try again.");
        return;
      }
    }
    // Every session is ended, this phone's included: forget it here and return to sign-in.
    await signOut();
  }

  const historyDetail =
    recentCount === undefined
      ? "On this phone only"
      : recentCount === 0
        ? "No recent searches on this phone"
        : `${recentCount} recent ${recentCount === 1 ? "search" : "searches"} on this phone`;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: screenTop }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <PushedHeader title="Settings" testID="settings-back" />
        <View style={styles.body}>
          <PushNotificationsSection onMessage={showToast} />

          <SectionLabel>Privacy and security</SectionLabel>
          <SettingsGroup>
            <SettingsRow
              icon={<HistoryIcon color={colors.black} size={ICON} />}
              label="Clear search history"
              detail={historyDetail}
              onPress={() => void clearHistory()}
              testID="settings-clear-history"
            />
            <SettingsRow
              icon={<DevicesIcon color={colors.black} size={ICON} />}
              label="Sign out of all devices"
              detail="For a lost or shared phone"
              onPress={() => {
                setSignOutAllError(undefined);
                setConfirmingSignOutAll(true);
              }}
              testID="settings-sign-out-all"
            />
          </SettingsGroup>

          <SectionLabel>Library</SectionLabel>
          <SettingsGroup>
            <SettingsRow
              icon={<PinIcon color={colors.black} size={ICON} />}
              label="Library info"
              detail="Hours, location and contact"
              opens
              onPress={() => router.push("/library-info")}
              testID="settings-library-info"
            />
          </SettingsGroup>

          <DeleteAccountSection onMessage={showToast} />

          <Text style={styles.version} testID="settings-version">
            LIBRAS for Android · version {Constants.expoConfig?.version ?? "0.1.0"}
          </Text>
        </View>
      </ScrollView>

      {toast === undefined ? null : (
        <View style={styles.toast} pointerEvents="none" accessibilityLiveRegion="polite" testID="settings-toast">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <ConfirmDialog
        visible={confirmingSignOutAll}
        title="Sign out of all devices?"
        message="Every phone signed in to your account, this one included, will need your password again."
        confirmLabel="Sign out all"
        busy={signingOutAll}
        error={signOutAllError}
        onCancel={() => setConfirmingSignOutAll(false)}
        onConfirm={() => void signOutEverywhere()}
        testID="sign-out-all-dialog"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: { paddingBottom: spacing.xxl },
  body: { paddingHorizontal: spacing.home, marginTop: 6 },
  version: { marginTop: 22, textAlign: "center", fontFamily: fontFamily.regular, fontSize: fontSize.resultNote, lineHeight: 16, color: colors.textMuted },
  toast: {
    position: "absolute",
    left: spacing.screen,
    right: spacing.screen,
    bottom: 36,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.option,
    backgroundColor: colors.ink,
    alignItems: "center",
  },
  toastText: { fontFamily: fontFamily.medium, fontSize: fontSize.label, lineHeight: 20, color: colors.white },
});
