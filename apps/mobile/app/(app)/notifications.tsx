import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { NOTIFICATION_MESSAGES, notificationDestination } from "@libras/shared";
import type { MemberNotification } from "@libras/shared";
import { api } from "../../src/api";
import { ApiError } from "../../src/api/client";
import { useAuth } from "../../src/auth/AuthContext";
import { BellIcon } from "../../src/components/OutlineIcons";
import { Toast } from "../../src/components/Toast";
import { useScreenTop } from "../../src/hooks/useScreenTop";
import { PushedHeader } from "../../src/navigation/PushedHeader";
import { NotificationRow } from "../../src/notifications/NotificationRow";
import { colors, fontFamily, fontSize, lineHeightFor, spacing } from "../../src/theme/tokens";

const RING = 64;
const TOAST_MS = 2500;

type InboxState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; notifications: MemberNotification[]; nextCursor: string | null; loadingMore: boolean };

/**
 * The Notifications screen, pushed from the bell on Home: back at the top left
 * and Mark all as read at the right, then the Member's Notifications newest
 * first (a page at a time as the list scrolls), each with an unread dot, its
 * title, line and how long ago. Tapping one marks it read and opens the screen
 * a tap on its push notification opens: My Books on Holds or Loans, or the
 * Announcement. With none, one line says what will show here.
 *
 * It needs no push notification setup: everything comes from the API.
 */
export default function NotificationsScreen() {
  const router = useRouter();
  const { request } = useAuth();
  const screenTop = useScreenTop();
  const [state, setState] = useState<InboxState>({ status: "loading" });
  const [markingAll, setMarkingAll] = useState(false);
  const [toast, setToast] = useState<string | undefined>();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const opening = useRef(false);
  const requestRef = useRef(request);
  requestRef.current = request;

  const showToast = useCallback((message: string) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(undefined), TOAST_MS);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const page = await requestRef.current((accessToken) => api.getNotifications(accessToken));
      setState({ status: "loaded", notifications: page.notifications, nextCursor: page.nextCursor, loadingMore: false });
    } catch (error) {
      setState({ status: "error", message: error instanceof ApiError ? error.message : NOTIFICATION_MESSAGES.loadFailed });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    if (state.status !== "loaded" || state.nextCursor === null || state.loadingMore) return;
    const cursor = state.nextCursor;
    setState({ ...state, loadingMore: true });
    try {
      const page = await request((accessToken) => api.getNotifications(accessToken, cursor));
      setState((current) =>
        current.status === "loaded"
          ? { status: "loaded", notifications: [...current.notifications, ...page.notifications], nextCursor: page.nextCursor, loadingMore: false }
          : current,
      );
    } catch {
      // Scrolling to the end again tries again.
      setState((current) => (current.status === "loaded" ? { ...current, loadingMore: false } : current));
    }
  };

  /** Shows these as read, without waiting for a reload. */
  const showRead = (ids: ReadonlySet<string> | "all") =>
    setState((current) =>
      current.status === "loaded"
        ? { ...current, notifications: current.notifications.map((entry) => (ids === "all" || ids.has(entry.id) ? { ...entry, read: true } : entry)) }
        : current,
    );

  const open = async (notification: MemberNotification) => {
    if (opening.current) return;
    opening.current = true;
    try {
      if (!notification.read) {
        try {
          await request((accessToken) => api.markNotificationRead(accessToken, notification.id));
          showRead(new Set([notification.id]));
        } catch {
          // It stays unread; what it is about still opens.
        }
      }
      const destination = notificationDestination(notification);
      if (destination.screen === "announcement") router.push("/announcement");
      else router.dismissTo({ pathname: "/my-books", params: { segment: destination.segment } });
    } finally {
      opening.current = false;
    }
  };

  const markAll = async () => {
    setMarkingAll(true);
    try {
      await request((accessToken) => api.markAllNotificationsRead(accessToken));
      showRead("all");
    } catch {
      showToast(NOTIFICATION_MESSAGES.markFailed);
    } finally {
      setMarkingAll(false);
    }
  };

  const anyUnread = state.status === "loaded" && state.notifications.some((entry) => !entry.read);
  const now = new Date();

  return (
    <View style={[styles.screen, { paddingTop: screenTop }]}>
      <PushedHeader
        title="Notifications"
        testID="notifications-back"
        action={
          state.status === "loaded" && state.notifications.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !anyUnread || markingAll }}
              disabled={!anyUnread || markingAll}
              hitSlop={8}
              onPress={() => void markAll()}
              testID="notifications-mark-all"
            >
              <Text style={[styles.markAll, !anyUnread && styles.markAllOff]}>Mark all as read</Text>
            </Pressable>
          ) : null
        }
      />

      {state.status === "loading" ? <ActivityIndicator color={colors.primary} style={styles.spinner} testID="notifications-loading" /> : null}

      {state.status === "error" ? (
        <View style={styles.failed} testID="notifications-error">
          <Text style={styles.failedText}>{state.message}</Text>
          <Pressable accessibilityRole="button" onPress={() => void load()} hitSlop={8} testID="notifications-retry">
            <Text style={styles.retry}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      {state.status === "loaded" ? (
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={state.notifications}
          keyExtractor={(entry) => entry.id}
          renderItem={({ item }) => <NotificationRow notification={item} now={now} onOpen={(entry) => void open(entry)} />}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.5}
          ListFooterComponent={state.loadingMore ? <ActivityIndicator color={colors.primary} style={styles.more} /> : undefined}
          ListEmptyComponent={
            <View style={styles.empty} testID="notifications-empty">
              <View style={styles.ring}>
                <BellIcon color={colors.textMuted} size={28} />
              </View>
              <Text style={styles.emptyLine}>{NOTIFICATION_MESSAGES.empty}</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
          testID="notifications-list"
        />
      ) : null}

      {toast === undefined ? null : <Toast message={toast} bottom={spacing.xxl} testID="notifications-toast" />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  markAll: { fontFamily: fontFamily.medium, fontSize: fontSize.action, lineHeight: lineHeightFor(fontSize.action), color: colors.primary },
  markAllOff: { color: colors.textMuted },
  spinner: { marginTop: spacing.xxl },
  list: { flex: 1, marginTop: spacing.md },
  listContent: { paddingBottom: spacing.xxl },
  more: { marginVertical: spacing.lg },
  failed: { alignItems: "center", gap: spacing.sm, marginTop: spacing.xxl, paddingHorizontal: spacing.home },
  failedText: { fontFamily: fontFamily.regular, fontSize: fontSize.small, lineHeight: lineHeightFor(fontSize.small), color: colors.textMuted, textAlign: "center" },
  retry: { fontFamily: fontFamily.semiBold, fontSize: fontSize.small, lineHeight: lineHeightFor(fontSize.small), color: colors.primary },
  empty: { alignItems: "center", gap: spacing.md, paddingTop: 72, paddingHorizontal: spacing.xl },
  ring: { width: RING, height: RING, borderRadius: RING / 2, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  emptyLine: {
    maxWidth: 260,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.small,
    lineHeight: lineHeightFor(fontSize.small),
    color: colors.textMuted,
    textAlign: "center",
  },
});
