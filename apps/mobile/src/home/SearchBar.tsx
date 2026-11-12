import { StyleSheet, TextInput, View } from "react-native";
import { SearchIcon } from "../components/icons";
import { colors, fontFamily, fontSize, radii, searchBarHeight } from "../theme/tokens";

interface SearchBarProps {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  maxLength: number;
}

/**
 * The Home search bar (Figma "iPhone 17 - 375", node 1032:2014): a 46-high pill
 * with a black outline and a soft shadow, the hint on the left, the magnifier on the right.
 */
export function SearchBar({ value, onChangeText, onSubmit, maxLength }: SearchBarProps) {
  return (
    <View style={styles.bar}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder="what’s on your mind"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Search the catalog by title, author, ISBN or call number"
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={maxLength}
        style={styles.input}
        testID="search-input"
      />
      <SearchIcon />
    </View>
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
  input: {
    flex: 1,
    height: "100%",
    paddingVertical: 0,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.label,
    color: colors.black,
  },
});
