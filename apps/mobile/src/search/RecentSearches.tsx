import { Pressable, StyleSheet, Text, View } from "react-native";
import { ClockIcon, CrossIcon } from "../components/OutlineIcons";
import { colors, fontFamily, fontSize, minTouchTarget, radii, spacing } from "../theme/tokens";

/** "Clear all": its line, and the height it is drawn with its padding. */
const LINK_LINE = 18;
const LINK_HEIGHT = LINK_LINE + 2 * spacing.xs;

interface RecentSearchesProps {
  searches: readonly string[];
  onPick: (query: string) => void;
  onRemove: (query: string) => void;
  onClear: () => void;
}

/** What search mode shows before anything is typed: the last 10 submitted searches, newest first. */
export function RecentSearches({ searches, onPick, onRemove, onClear }: RecentSearchesProps) {
  if (searches.length === 0) {
    return (
      <View style={styles.empty} testID="recent-empty">
        <View style={styles.ring}>
          <ClockIcon color={colors.textMuted} size={28} />
        </View>
        <Text style={styles.emptyTitle}>No recent searches</Text>
        <Text style={styles.emptyBody}>Your last 10 searches show here. They stay on this phone and are cleared when you sign out.</Text>
      </View>
    );
  }
  return (
    <View testID="recent-searches">
      <View style={styles.head}>
        <Text style={styles.label}>RECENT SEARCHES</Text>
        <Pressable accessibilityRole="button" onPress={onClear} style={styles.clearTarget} testID="recent-clear">
          <Text style={styles.link}>Clear all</Text>
        </Pressable>
      </View>
      {searches.map((search, index) => (
        <View key={search} style={styles.row}>
          <Pressable accessibilityRole="button" onPress={() => onPick(search)} style={styles.go} testID={`recent-${index}`}>
            <ClockIcon color={colors.textMuted} size={18} />
            <Text style={styles.text} numberOfLines={1}>
              {search}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${search}`}
            onPress={() => onRemove(search)}
            style={styles.remove}
            testID={`recent-remove-${index}`}
          >
            <CrossIcon color={colors.textMuted} size={16} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 20, marginBottom: 6 },
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.listLabel, lineHeight: 15, letterSpacing: 0.84, color: colors.textMuted },
  // 48 pt to tap, spilling over the heading row without making it taller.
  clearTarget: { minHeight: minTouchTarget, justifyContent: "center", marginVertical: -(minTouchTarget - LINK_HEIGHT) / 2 },
  link: { fontFamily: fontFamily.medium, fontSize: fontSize.action, lineHeight: LINK_LINE, color: colors.primary, paddingVertical: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.pill },
  go: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md, minWidth: 0, paddingVertical: 11 },
  text: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.listRow, lineHeight: 20, color: colors.black },
  // The row's full height and 48 pt wide; the cross stays at the row's right end.
  remove: { alignSelf: "stretch", width: minTouchTarget, alignItems: "flex-end", justifyContent: "center", paddingRight: spacing.xs },
  empty: { alignItems: "center", paddingVertical: 48, paddingHorizontal: spacing.md, gap: 10 },
  ring: { width: 64, height: 64, borderRadius: radii.iconRing, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.emptyTitle, lineHeight: 24, color: colors.black, marginTop: spacing.xs },
  emptyBody: { fontFamily: fontFamily.regular, fontSize: fontSize.small, lineHeight: 19, color: colors.textMuted, textAlign: "center", maxWidth: 250 },
});
