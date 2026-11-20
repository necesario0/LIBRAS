import { Pressable, StyleSheet, Text, View } from "react-native";
import { notificationAge } from "@libras/shared";
import type { MemberNotification, NotificationKind } from "@libras/shared";
import { BellIcon, BooksTabIcon, ClockIcon } from "../components/OutlineIcons";
import { colors, fontFamily, fontSize, lineHeightFor, spacing } from "../theme/tokens";

const RING = 40;
const ICON = 20;
const DOT = 8;

/** The icon of each kind: My Books for a ready Hold, a clock for a Loan (red once overdue), the bell for an Announcement. */
function KindIcon({ kind }: { kind: NotificationKind }) {
  switch (kind) {
    case "holdReady":
      return <BooksTabIcon color={colors.black} size={ICON} />;
    case "loanDueTomorrow":
      return <ClockIcon color={colors.black} size={ICON} />;
    case "loanOverdue":
      return <ClockIcon color={colors.danger} size={ICON} />;
    case "announcement":
      return <BellIcon color={colors.black} size={ICON} />;
    default: {
      const unknown: never = kind;
      throw new Error(`No icon for Notifications of kind ${String(unknown)}`);
    }
  }
}

interface NotificationRowProps {
  notification: MemberNotification;
  /** The phone's time now, for "5 minutes ago". */
  now: Date;
  onOpen: (notification: MemberNotification) => void;
}

/**
 * One Notification (the My Books list rows, with a Settings icon): the kind's
 * icon in a ring, the title, how long ago, the line, and a blue dot while it is
 * unread. Tapping it opens what it is about.
 */
export function NotificationRow({ notification, now, onOpen }: NotificationRowProps) {
  const { title, body, read, kind } = notification;
  const age = notificationAge(notification.at, now);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${read ? "" : "Unread. "}${title}. ${body} ${age}.`}
      onPress={() => onOpen(notification)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={`notification-${kind}`}
    >
      <View style={styles.ring}>
        <KindIcon kind={kind} />
      </View>
      <View style={styles.text}>
        <View style={styles.titleLine}>
          <Text style={[styles.title, !read && styles.unreadTitle]} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.age} numberOfLines={1}>
            {age}
          </Text>
        </View>
        <Text style={styles.body} numberOfLines={3}>
          {body}
        </Text>
      </View>
      <View style={styles.dotSlot}>{read ? null : <View style={styles.dot} testID="notification-unread" />}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.home,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
    backgroundColor: colors.white,
  },
  pressed: { backgroundColor: colors.surface },
  ring: { width: RING, height: RING, borderRadius: RING / 2, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, gap: 3 },
  titleLine: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  title: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.listRow, lineHeight: lineHeightFor(fontSize.listRow), color: colors.black },
  unreadTitle: { fontFamily: fontFamily.semiBold },
  age: {
    marginTop: 2,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.resultNote,
    lineHeight: lineHeightFor(fontSize.resultNote),
    color: colors.textMuted,
  },
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.small, lineHeight: lineHeightFor(fontSize.small), color: colors.textSecondary },
  // Always there, so a row keeps its width when it is read.
  dotSlot: { width: DOT, height: RING, justifyContent: "center" },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: colors.primary },
});
