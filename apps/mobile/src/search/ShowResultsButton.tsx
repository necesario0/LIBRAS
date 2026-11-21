import { Pressable, StyleSheet, Text } from "react-native";
import { colors, fontFamily, fontSize, radii } from "../theme/tokens";

/**
 * What the closing button of a search sheet knows about the results:
 * - `no-search`: nothing is shown yet (the bar is empty or being typed in), so a change only takes effect on the next search;
 * - `counting`: the search is running again with the change (or failed);
 * - `counted`: how many results the search now has.
 */
export type ResultsCount = { kind: "no-search" } | { kind: "counting" } | { kind: "counted"; total: number };

/** "Done" before any search, then "Show 12 results", "Show 1 result", or "Show results" while it counts. */
export function showResultsLabel(results: ResultsCount): string {
  switch (results.kind) {
    case "no-search":
      return "Done";
    case "counting":
      return "Show results";
    case "counted":
      return `Show ${results.total} ${results.total === 1 ? "result" : "results"}`;
  }
}

/** The blue button at the foot of the Filters and Published sheets: it closes the sheet. A change has already applied. */
export function ShowResultsButton({ results, onPress, testID }: { results: ResultsCount; onPress: () => void; testID: string }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.show} testID={testID}>
      <Text style={styles.showText}>{showResultsLabel(results)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  show: {
    marginTop: 22,
    minHeight: 48,
    paddingVertical: 12,
    borderRadius: radii.formButton,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  showText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.note, lineHeight: 19, color: colors.white },
});
