import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { CATALOG_SEARCH_MAX_QUERY_LENGTH } from "@libras/shared";
import { ClearFieldIcon, MagnifierIcon } from "../components/OutlineIcons";
import { colors, fontFamily, fontSize, minTouchTarget, radii, searchBarHeight } from "../theme/tokens";

interface SearchModeBarProps {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

/**
 * The bar of search mode (approved Tier 3 preview): a focused field with a clear
 * button, and Cancel beside it. Both are drawn small but take a full-size tap:
 * the clear button the field's whole height at its right end, Cancel 48 pt.
 */
export function SearchModeBar({ value, onChangeText, onSubmit, onCancel }: SearchModeBarProps) {
  return (
    <View style={styles.row}>
      <View style={styles.field}>
        <MagnifierIcon color={colors.textMuted} size={20} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          placeholder="Title, author, ISBN or call number"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Search the catalog by title, author, ISBN or call number"
          returnKeyType="search"
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={CATALOG_SEARCH_MAX_QUERY_LENGTH}
          style={styles.input}
          testID="search-input"
        />
        {value !== "" ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear" onPress={() => onChangeText("")} style={styles.clear} testID="search-clear">
            <ClearFieldIcon color={colors.clearField} size={20} />
          </Pressable>
        ) : null}
      </View>
      <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancelTarget} testID="search-cancel">
        <Text style={styles.cancel}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  field: {
    flex: 1,
    height: searchBarHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 14,
    paddingRight: 8,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radii.search,
    backgroundColor: colors.white,
    boxShadow: "0px 0px 0px 4px rgba(0, 93, 195, 0.12)",
  },
  input: { flex: 1, minWidth: 0, height: "100%", paddingVertical: 0, fontFamily: fontFamily.regular, fontSize: fontSize.note, color: colors.black },
  // Runs to the field's right border: the cross stays where the padding put it.
  clear: { alignSelf: "stretch", width: 44, marginRight: -8, paddingRight: 8, alignItems: "flex-end", justifyContent: "center" },
  cancelTarget: { minHeight: minTouchTarget, minWidth: minTouchTarget, justifyContent: "center", alignItems: "center" },
  cancel: { fontFamily: fontFamily.medium, fontSize: fontSize.label, lineHeight: 20, color: colors.black },
});
