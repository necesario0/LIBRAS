import { PUBLISHED_YEAR_MAX, PUBLISHED_YEAR_MIN, libraryYear } from "@libras/shared";
import type { PublishedFilter } from "@libras/shared";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BottomSheet } from "../components/BottomSheet";
import { ShowResultsButton } from "./ShowResultsButton";
import type { ResultsCount } from "./ShowResultsButton";
import { colors, fontFamily, fontSize, radii, segmentShadow, spacing } from "../theme/tokens";

/** The four Published choices, in order. */
const PUBLISHED_CHOICES = [
  { key: "any", label: "Any time" },
  { key: "last5", label: "Last 5 years" },
  { key: "last10", label: "Last 10 years" },
  { key: "custom", label: "Custom" },
] as const;
type PublishedChoice = (typeof PUBLISHED_CHOICES)[number]["key"];

function choiceOf(published: PublishedFilter): PublishedChoice {
  switch (published.kind) {
    case "any":
      return "any";
    case "between":
      return "custom";
    case "last":
      return published.years === 5 ? "last5" : "last10";
  }
}

/** A custom year as typed: a whole four-digit year, or undefined. */
function readYear(text: string): number | undefined {
  if (!/^\d{4}$/.test(text)) return undefined;
  const year = Number(text);
  return year >= PUBLISHED_YEAR_MIN && year <= PUBLISHED_YEAR_MAX ? year : undefined;
}

/**
 * The Published sheet, opened by the Published chip of search mode: Any time,
 * the last 5 or 10 years, or a Custom range of years (From and to, both
 * included, checked as they are typed). A choice applies at once; the button
 * under it closes the sheet and says how many results are left ("Done" before
 * any search). The scrim and Android back close it too.
 */
export function PublishedSheet({
  visible,
  published,
  onChange,
  onClose,
  results,
}: {
  visible: boolean;
  published: PublishedFilter;
  onChange: (published: PublishedFilter) => void;
  onClose: () => void;
  results: ResultsCount;
}) {
  const currentYear = libraryYear(new Date());
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");

  // Each opening starts the custom range from what is applied (or the last ten years).
  useEffect(() => {
    if (!visible) return;
    setFromText(String(published.kind === "between" ? published.from : currentYear - 10));
    setToText(String(published.kind === "between" ? published.to : currentYear));
    // Only on opening: typing in the range must not reset it.
  }, [visible]);

  const from = readYear(fromText);
  const to = readYear(toText);
  const rangeValid = from !== undefined && to !== undefined && from <= to;

  const choose = (choice: PublishedChoice) => {
    switch (choice) {
      case "any":
        return onChange({ kind: "any" });
      case "last5":
        return onChange({ kind: "last", years: 5 });
      case "last10":
        return onChange({ kind: "last", years: 10 });
      case "custom":
        return onChange(rangeValid ? { kind: "between", from, to } : { kind: "between", from: currentYear - 10, to: currentYear });
    }
  };

  const editRange = (nextFrom: string, nextTo: string) => {
    setFromText(nextFrom);
    setToText(nextTo);
    const start = readYear(nextFrom);
    const end = readYear(nextTo);
    if (start !== undefined && end !== undefined && start <= end) onChange({ kind: "between", from: start, to: end });
  };

  return (
    <BottomSheet visible={visible} title="Published" onClose={onClose} closeLabel="Close Published" testID="published-sheet">
      <View style={styles.section}>
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

      <ShowResultsButton results={results} onPress={onClose} testID="published-show" />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 20, gap: spacing.md },
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
});
