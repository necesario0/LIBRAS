import { Pressable, StyleSheet, Text, View } from "react-native";
import { bellLabel, unreadBadgeText } from "@libras/shared";
import { BellIcon } from "../components/OutlineIcons";
import { colors, fontFamily, fontSize, lineHeightFor } from "../theme/tokens";

const BUTTON = 44;
const ICON = 26;
const BADGE = 20;

/**
 * The bell at the right of the Home header (approved Tier 3 preview `bell`):
 * it opens the Notifications screen. A red badge on it counts the unread
 * Notifications: none at zero, "9+" above nine.
 */
export function NotificationBell({ unread, onPress }: { unread: number; onPress: () => void }) {
  const badge = unreadBadgeText(unread);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={bellLabel(unread)}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      testID="home-bell"
    >
      <BellIcon color={colors.black} size={ICON} />
      {badge === undefined ? null : (
        <View style={styles.badge}>
          <Text style={styles.badgeText} numberOfLines={1} maxFontSizeMultiplier={1.3} testID="home-bell-badge">
            {badge}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: BUTTON, height: BUTTON, borderRadius: BUTTON / 2, alignItems: "center", justifyContent: "center" },
  pressed: { backgroundColor: colors.surface },
  // Over the bell's upper right, ringed in white so it stands off the stroke.
  badge: {
    position: "absolute",
    top: 3,
    left: BUTTON / 2 + 1,
    minWidth: BADGE,
    minHeight: BADGE,
    borderRadius: BADGE / 2,
    borderWidth: 2,
    borderColor: colors.white,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.danger,
  },
  badgeText: {
    color: colors.white,
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.listLabel,
    lineHeight: lineHeightFor(fontSize.listLabel),
    includeFontPadding: false,
  },
});
