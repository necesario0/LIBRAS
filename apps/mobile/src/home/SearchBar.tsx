import { Pressable, StyleSheet, Text } from "react-native";
import { SearchIcon } from "../components/icons";
import { colors, fontFamily, fontSize, radii, searchBarHeight } from "../theme/tokens";

/**
 * The Home search bar (Figma "iPhone 17 - 375", node 1032:2014): a 46-high pill
 * with a black outline and a soft shadow, the hint on the left, the magnifier on
 * the right. It is a button: tapping it opens search mode, where the typing happens.
 */
export function SearchBar({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="search"
      accessibilityLabel="Search the catalog by title, author, ISBN or call number"
      onPress={onPress}
      style={styles.bar}
      testID="search-open"
    >
      <Text style={styles.hint}>what’s on your mind</Text>
      <SearchIcon />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: searchBarHeight,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.black,
    borderRadius: radii.search,
    paddingLeft: 11,
    paddingRight: 9,
    backgroundColor: colors.white,
    // Figma: 0 4 4 0 at 25% black.
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  hint: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.label, color: colors.textMuted },
});
