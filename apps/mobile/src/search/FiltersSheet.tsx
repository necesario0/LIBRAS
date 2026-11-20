import { PUBLISHED_YEAR_MAX, PUBLISHED_YEAR_MIN, SUBJECT_LC_CLASSES, libraryYear } from "@libras/shared";
import type { CatalogSearchFilters, PublishedFilter, Subject, UmakCollege } from "@libras/shared";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Toggle } from "../components/Toggle";
import { colors, fontFamily, fontSize, radii, segmentShadow, spacing } from "../theme/tokens";

/** The four Published choices of the sheet, in order. */
const PUBLISHED_CHOICES = [
  { key: "any", label: "Any time" },
  { key: "last5", label: "Last 5 years" },
  { key: "last10", label: "Last 10 years" },
  { key: "custom", label: "Custom" },
] as const;
type PublishedChoice = (typeof PUBLISHED_CHOICES)[number]["key"];

function choiceOf(published: PublishedFilter): PublishedChoice {
  if (published.kind === "any") return "any";
  if (published.kind === "between") return "custom";
  return published.years === 5 ? "last5" : "last10";
}

/** How the removable chip and the sheet name a Published filter: "Last 5 years" or "2016 to 2026". */
export function publishedLabel(published: PublishedFilter): string {
  switch (published.kind) {
    case "any":
      return "Any time";
    case "last":
      return `Last ${published.years} years`;
    case "between":
      return `${published.from} to ${published.to}`;
  }
}

/** A custom year as typed: a whole four-digit year, or undefined. */
function readYear(text: string): number | undefined {
  if (!/^\d{4}$/.test(text)) return undefined;
  const year = Number(text);
  return year >= PUBLISHED_YEAR_MIN && year <= PUBLISHED_YEAR_MAX ? year : undefined;
}

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
 * The Filters bottom sheet of search results (approved Tier 3 preview): the
 * Subjects that have Books (the Member's college's first, each with the LC
 * classes it covers), when the Books were published, and the Latest edition
 * only switch. A change applies at once, so the button under it shows how many
 * results the filters leave, live; it closes the sheet, as do the scrim and
 * Android back. Reset turns every filter off.
 */
export function FiltersSheet({
  visible,
  filters,
  onChange,
  onReset,
  onClose,
  subjects,
  college,
  count,
}: {
  visible: boolean;
  filters: CatalogSearchFilters;
  onChange: (change: Partial<CatalogSearchFilters>) => void;
  onReset: () => void;
  onClose: () => void;
  subjects: SubjectOptions;
  /** The Member's college, whose Subjects come first; null for a Member with none. */
  college: UmakCollege | null;
  /** How many results the search now has; undefined while it runs or when it failed. */
  count: number | undefined;
}) {
  const insets = useSafeAreaInsets();
  const currentYear = libraryYear(new Date());
  const published = filters.published;
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const rise = useRef(new Animated.Value(0)).current;

  // Each opening starts the custom range from what is applied (or the last ten years).
  useEffect(() => {
    if (!visible) return;
    setFromText(String(published.kind === "between" ? published.from : currentYear - 10));
    setToText(String(published.kind === "between" ? published.to : currentYear));
    rise.setValue(0);
    Animated.timing(rise, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    // Only on opening: typing in the range must not reset it.
  }, [visible]);

  const from = readYear(fromText);
  const to = readYear(toText);
  const rangeValid = from !== undefined && to !== undefined && from <= to;

  const choose = (choice: PublishedChoice) => {
    switch (choice) {
      case "any":
        return onChange({ published: { kind: "any" } });
      case "last5":
        return onChange({ published: { kind: "last", years: 5 } });
      case "last10":
        return onChange({ published: { kind: "last", years: 10 } });
      case "custom":
        return onChange({ published: rangeValid ? { kind: "between", from, to } : { kind: "between", from: currentYear - 10, to: currentYear } });
    }
  };

  const editRange = (nextFrom: string, nextTo: string) => {
    setFromText(nextFrom);
    setToText(nextTo);
    const start = readYear(nextFrom);
    const end = readYear(nextTo);
    if (start !== undefined && end !== undefined && start <= end) onChange({ published: { kind: "between", from: start, to: end } });
  };

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

  const showLabel = count === undefined ? "Show results" : `Show ${count} ${count === 1 ? "result" : "results"}`;
  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [400, 0] });

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.root}>
        <Pressable accessibilityLabel="Close filters" onPress={onClose} style={styles.scrim} testID="filters-scrim" />
        <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 30, transform: [{ translateY }] }]} accessibilityViewIsModal testID="filters-sheet">
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <View style={styles.grab} />
            <View style={styles.head}>
              <Text style={styles.title} accessibilityRole="header">
                Filters
              </Text>
              <Pressable accessibilityRole="button" onPress={onReset} hitSlop={8} testID="filters-reset">
                <Text style={styles.link}>Reset</Text>
              </Pressable>
            </View>

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

            <View style={styles.section}>
              <Text style={styles.label}>PUBLISHED</Text>
              <View style={styles.segments}>
                {PUBLISHED_CHOICES.map(({ key, label }) => {
                  const on = choiceOf(published) === key;
                  return (
                    <Pressable
                      key={key}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => choose(key)}
                      style={[styles.segment, on && styles.segmentOn]}
                      testID={`filter-published-${key}`}
                    >
                      <Text style={styles.segmentText} numberOfLines={1} adjustsFontSizeToFit>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {published.kind === "between" ? (
                <>
                  <View style={styles.range}>
                    <Text style={styles.rangeText}>From</Text>
                    <TextInput
                      accessibilityLabel="From year"
                      selectTextOnFocus
                      value={fromText}
                      onChangeText={(text) => editRange(text, toText)}
                      keyboardType="number-pad"
                      maxLength={4}
                      style={styles.year}
                      testID="filter-published-from"
                    />
                    <Text style={styles.rangeText}>to</Text>
                    <TextInput
                      accessibilityLabel="To year"
                      selectTextOnFocus
                      value={toText}
                      onChangeText={(text) => editRange(fromText, text)}
                      keyboardType="number-pad"
                      maxLength={4}
                      style={styles.year}
                      testID="filter-published-to"
                    />
                  </View>
                  {rangeValid ? null : (
                    <Text style={styles.error} testID="filter-published-error">
                      Enter two four-digit years, the first not after the second.
                    </Text>
                  )}
                </>
              ) : null}
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

            <Pressable accessibilityRole="button" onPress={onClose} style={styles.show} testID="filters-show">
              <Text style={styles.showText}>{showLabel}</Text>
            </Pressable>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  sheet: {
    maxHeight: "86%",
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
  },
  content: { paddingTop: 10, paddingHorizontal: 22 },
  grab: { alignSelf: "center", width: 44, height: 5, borderRadius: radii.grabber, backgroundColor: colors.grabber, marginBottom: 14 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.name, lineHeight: 28, letterSpacing: -0.8, color: colors.black },
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
  segments: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radii.publishedChoices, padding: 3, gap: 3 },
  segment: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: radii.publishedChoice, paddingVertical: spacing.sm, paddingHorizontal: 2 },
  segmentOn: { backgroundColor: colors.white, boxShadow: segmentShadow },
  segmentText: { fontFamily: fontFamily.medium, fontSize: fontSize.resultNote, lineHeight: 15, color: colors.black },
  range: { flexDirection: "row", alignItems: "center", gap: 10 },
  rangeText: { fontFamily: fontFamily.regular, fontSize: fontSize.action, lineHeight: 16, color: colors.black },
  year: {
    width: 84,
    height: 38,
    borderRadius: radii.field,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 0,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.label,
    color: colors.black,
  },
  error: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: 16, color: colors.danger },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  toggleText: { flex: 1, gap: 2 },
  toggleTitle: { fontFamily: fontFamily.medium, fontSize: fontSize.listRow, lineHeight: 19, color: colors.black },
  toggleNote: { fontFamily: fontFamily.regular, fontSize: fontSize.resultNote, lineHeight: 15, color: colors.textMuted },
  show: {
    marginTop: 22,
    height: 48,
    borderRadius: radii.formButton,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  showText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.note, lineHeight: 19, color: colors.white },
});
