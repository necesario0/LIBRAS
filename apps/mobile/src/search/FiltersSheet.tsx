import { SUBJECT_LC_CLASSES } from "@libras/shared";
import type { CatalogSearchFilters, Subject, UmakCollege } from "@libras/shared";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { BottomSheet } from "../components/BottomSheet";
import { Toggle } from "../components/Toggle";
import { ShowResultsButton } from "./ShowResultsButton";
import type { ResultsCount } from "./ShowResultsButton";
import { colors, fontFamily, fontSize, radii, spacing } from "../theme/tokens";

/** What the Subject part of the sheet lists: still loading, failed, or the options (the college's first). */
export type SubjectOptions =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; college: Subject[]; others: Subject[] };

function SubjectOption({ subject, on, onPress }: { subject: Subject; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${subject}, LC classes ${SUBJECT_LC_CLASSES[subject]}`}
      onPress={onPress}
      style={[styles.option, on && styles.optionOn]}
      testID={`filter-subject-${subject}`}
    >
      <Text style={styles.optionText}>{subject}</Text>
      <Text style={[styles.optionClasses, on && styles.optionClassesOn]}>{SUBJECT_LC_CLASSES[subject]}</Text>
    </Pressable>
  );
}

/**
 * The Filters bottom sheet of search mode (approved Tier 3 preview, less
 * Published, which has its own chip and sheet since 2026-11-21): the Subjects
 * that have Books (the Member's college's first, each with the LC classes it
 * covers) and the Latest edition only switch. A change applies at once, so the
 * button under it shows how many results the filters leave, live, or reads
 * "Done" before any search (the filters then wait for the next one). It closes
 * the sheet, as do the scrim and Android back. Reset turns the sheet's filters
 * off (Available now and Published keep their own chips).
 */
export function FiltersSheet({
  visible,
  filters,
  onChange,
  onReset,
  onClose,
  subjects,
  college,
  results,
}: {
  visible: boolean;
  filters: CatalogSearchFilters;
  onChange: (change: Partial<CatalogSearchFilters>) => void;
  onReset: () => void;
  onClose: () => void;
  subjects: SubjectOptions;
  /** The Member's college, whose Subjects come first; null for a Member with none. */
  college: UmakCollege | null;
  results: ResultsCount;
}) {
  const toggleSubject = (subject: Subject) => {
    const on = filters.subjects.includes(subject);
    onChange({ subjects: on ? filters.subjects.filter((chosen) => chosen !== subject) : [...filters.subjects, subject] });
  };

  const options = (list: readonly Subject[]) => (
    <View style={styles.options}>
      {list.map((subject) => (
        <SubjectOption key={subject} subject={subject} on={filters.subjects.includes(subject)} onPress={() => toggleSubject(subject)} />
      ))}
    </View>
  );

  return (
    <BottomSheet
      visible={visible}
      title="Filters"
      onClose={onClose}
      closeLabel="Close filters"
      testID="filters-sheet"
      headAction={
        <Pressable accessibilityRole="button" onPress={onReset} hitSlop={8} testID="filters-reset">
          <Text style={styles.link}>Reset</Text>
        </Pressable>
      }
    >
      <View style={styles.section}>
        <Text style={styles.label}>SUBJECT</Text>
        {subjects.status === "loading" ? <ActivityIndicator color={colors.primary} style={styles.spinner} testID="filters-subjects-loading" /> : null}
        {subjects.status === "error" ? (
          <Text style={styles.note} testID="filters-subjects-error">
            {subjects.message}
          </Text>
        ) : null}
        {subjects.status === "loaded" && college !== null && subjects.college.length > 0 ? (
          <>
            <Text style={styles.groupLabel}>{`For ${college}`}</Text>
            {options(subjects.college)}
            <Text style={styles.groupLabel}>All Subjects</Text>
          </>
        ) : null}
        {subjects.status === "loaded" ? options(subjects.others) : null}
      </View>

      <View style={[styles.section, styles.toggleRow]}>
        <View style={styles.toggleText}>
          <Text style={styles.toggleTitle}>Latest edition only</Text>
          <Text style={styles.toggleNote}>Older editions of the same book fold into one row.</Text>
        </View>
        <Toggle
          on={filters.latestEditionOnly}
          onPress={() => onChange({ latestEditionOnly: !filters.latestEditionOnly })}
          label="Latest edition only"
          testID="filter-latest-edition"
        />
      </View>

      <ShowResultsButton results={results} onPress={onClose} testID="filters-show" />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  link: { fontFamily: fontFamily.medium, fontSize: fontSize.action, lineHeight: 16, color: colors.primary, paddingVertical: spacing.xs },
  section: { marginTop: 20, gap: spacing.sm },
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.listLabel, lineHeight: 14, letterSpacing: 0.84, color: colors.textMuted },
  groupLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 16, color: colors.textMuted },
  spinner: { alignSelf: "flex-start", marginVertical: spacing.sm },
  note: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 16, color: colors.textSecondary },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  option: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radii.option,
    paddingVertical: 6,
    paddingHorizontal: 11,
  },
  optionOn: { backgroundColor: colors.accent, borderColor: colors.black },
  optionText: { fontFamily: fontFamily.regular, fontSize: fontSize.action, lineHeight: 16, color: colors.black },
  optionClasses: { fontFamily: fontFamily.monoLabel, fontSize: fontSize.lcClasses, lineHeight: 12, color: colors.textMuted },
  optionClassesOn: { color: colors.black },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  toggleText: { flex: 1, gap: 2 },
  toggleTitle: { fontFamily: fontFamily.medium, fontSize: fontSize.listRow, lineHeight: 19, color: colors.black },
  toggleNote: { fontFamily: fontFamily.regular, fontSize: fontSize.resultNote, lineHeight: 15, color: colors.textMuted },
});
