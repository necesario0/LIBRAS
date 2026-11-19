import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useScreenTop } from "../../src/hooks/useScreenTop";
import { PushedHeader } from "../../src/navigation/PushedHeader";
import { LIBRARY_INFO, LIBRARY_INFO_NOTE, libraryInfoHasExamples } from "../../src/settings/library-info";
import { FactTable, SectionLabel } from "../../src/settings/SettingsParts";
import { colors, fontFamily, fontSize, spacing } from "../../src/theme/tokens";

/**
 * Library info (approved Tier 3 preview): opening hours, where the library is
 * and how to reach it, as static text (`LIBRARY_INFO`). The values are
 * examples until the library supplies the real ones, and the screen says so.
 */
export default function LibraryInfoScreen() {
  const screenTop = useScreenTop();
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: screenTop }]} showsVerticalScrollIndicator={false}>
        <PushedHeader title="Library info" testID="library-info-back" />
        <View style={styles.body}>
          {LIBRARY_INFO.map((section) => (
            <View key={section.title}>
              <SectionLabel>{section.title}</SectionLabel>
              <FactTable facts={section.facts} testID={`library-info-${section.title.toLowerCase().replaceAll(" ", "-")}`} />
            </View>
          ))}
          {libraryInfoHasExamples ? (
            <Text style={styles.note} testID="library-info-note">
              {LIBRARY_INFO_NOTE}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: { paddingBottom: spacing.xxl },
  body: { paddingHorizontal: spacing.home, marginTop: 6 },
  note: { marginTop: 12, marginHorizontal: spacing.xs, fontFamily: fontFamily.regular, fontSize: fontSize.resultNote, lineHeight: 16, color: colors.textMuted },
});
