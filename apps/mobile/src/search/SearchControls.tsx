import { CATALOG_SORTS, CATALOG_SORT_LABELS, activeFilterCount, publishedFilterLabel } from "@libras/shared";
import type { CatalogSearchFilters, CatalogSort } from "@libras/shared";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { BackHandler, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";
import { CalendarIcon, CheckIcon, ChevronDownIcon, CrossIcon, SlidersIcon, SortIcon } from "../components/OutlineIcons";
import { colors, fontFamily, fontSize, minTouchTarget, popupMenuShadow, radii, spacing } from "../theme/tokens";

/** The chips' height, and how far below their top the Sort menu opens. */
const CHIP_HEIGHT = 34;
const MENU_TOP = CHIP_HEIGHT + 8;
/** A filter chip under the row is drawn smaller still. */
const FILTER_CHIP_HEIGHT = 28;

/**
 * How far a chip's 48 pt tap reaches above and below the drawn chip. The tap
 * takes no room: the rows keep the spacing of the design. A screen that puts
 * the chips at the top of a scroll view pads its content by this much, so the
 * part above the first row is inside the scroll view and can be tapped.
 */
export const CHIP_TOUCH_INSET = (minTouchTarget - CHIP_HEIGHT) / 2;

function Chip({
  on,
  label,
  onPress,
  icon,
  trailing,
  testID,
  expanded,
}: {
  on: boolean;
  label: string;
  onPress?: () => void;
  icon?: ReactNode;
  trailing?: ReactNode;
  testID: string;
  expanded?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on, expanded, disabled: onPress === undefined }}
      disabled={onPress === undefined}
      onPress={onPress}
      style={styles.chipTarget}
      testID={testID}
    >
      <View style={[styles.chip, on && styles.chipOn]}>
        {icon}
        <Text style={styles.chipText}>{label}</Text>
        {trailing}
      </View>
    </Pressable>
  );
}

/** One filter that is on, under the controls: tapping it turns that filter off. */
function FilterChip({ label, onRemove, testID }: { label: string; onRemove: () => void; testID: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${label}`} onPress={onRemove} style={styles.filterChipTarget} testID={testID}>
      <View style={styles.filterChip}>
        <Text style={styles.filterChipText}>{label}</Text>
        <CrossIcon color={colors.primary} size={14} />
      </View>
    </Pressable>
  );
}

/**
 * The row under the search bar in search mode (approved Tier 3 preview, with
 * the owner's changes of 2026-11-21): the Sort chip, which opens a menu of the
 * four orders just under it; the one-tap Available now chip; the Published
 * chip, which names the years chosen ("Published: Last 5 years") and opens the
 * Published sheet; and the Filters chip, which opens the Filters sheet and says
 * how many of its filters are on. The menu closes on a choice, on the Sort
 * chip, or on Android back.
 *
 * The row shows from the moment search mode opens, so filters can be chosen
 * before typing: they then apply to the next search.
 *
 * Under the row, each filter of the Filters sheet that is on shows as a chip
 * that removes it: each Subject, and "All editions" when Latest edition only is
 * off. Published has none: its chip already shows it.
 *
 * The menu opens over the results. It is not a child of the row but its next
 * sibling, placed by the row's position: Android leaves a view drawn outside
 * its parent's bounds out of the accessibility tree, so a menu hanging below
 * the row could be seen and tapped but never reached by TalkBack (or Maestro).
 * The parent must therefore reach as far down as the menu (Home's search-mode
 * content fills the screen) and must not clip it.
 */
export function SearchControls({
  filters,
  onChange,
  onOpenPublished,
  onOpenFilters,
}: {
  filters: CatalogSearchFilters;
  onChange: (change: Partial<CatalogSearchFilters>) => void;
  onOpenPublished: () => void;
  onOpenFilters: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Where the row sits in its parent, so the menu can open just under the Sort chip.
  const [rowAt, setRowAt] = useState<{ x: number; y: number } | null>(null);
  const filterCount = activeFilterCount(filters);
  const published = filters.published.kind !== "any";

  // Android back closes the menu first (Home's own handler, registered earlier, would leave search mode).
  useFocusEffect(
    useCallback(() => {
      if (!menuOpen) return undefined;
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        setMenuOpen(false);
        return true;
      });
      return () => subscription.remove();
    }, [menuOpen]),
  );

  const choose = (sort: CatalogSort) => {
    setMenuOpen(false);
    if (sort !== filters.sort) onChange({ sort });
  };

  return (
    <>
      <View onLayout={(event) => setRowAt({ x: event.nativeEvent.layout.x, y: event.nativeEvent.layout.y })}>
        {/* The chips wrap onto a second line when they do not fit, so none is ever pushed off the screen (owner decision, #65). */}
        <View style={styles.row} testID="search-controls-row">
          <Chip
            on
            label={CATALOG_SORT_LABELS[filters.sort]}
            onPress={() => setMenuOpen(!menuOpen)}
            expanded={menuOpen}
            icon={<SortIcon color={colors.black} size={15} />}
            trailing={<ChevronDownIcon color={colors.black} size={14} />}
            testID="search-sort"
          />
          <Chip
            on={filterCount > 0}
            label={filterCount > 0 ? `Filters (${filterCount})` : "Filters"}
            onPress={() => {
              setMenuOpen(false);
              onOpenFilters();
            }}
            icon={<SlidersIcon color={colors.black} size={15} />}
            testID="search-filters"
          />
          <Chip
            on={published}
            label={published ? `Published: ${publishedFilterLabel(filters.published)}` : "Published"}
            onPress={() => {
              setMenuOpen(false);
              onOpenPublished();
            }}
            icon={<CalendarIcon color={colors.black} size={15} />}
            trailing={<ChevronDownIcon color={colors.black} size={14} />}
            testID="search-published"
          />
          <Chip
            on={filters.availableNow}
            label="Available now"
            onPress={() => {
              setMenuOpen(false);
              onChange({ availableNow: !filters.availableNow });
            }}
            icon={filters.availableNow ? <CheckIcon color={colors.black} size={14} /> : undefined}
            testID="search-available-now"
          />
        </View>

        {filterCount > 0 ? (
          <View style={styles.filterChips} testID="search-filter-chips">
            {filters.subjects.map((subject) => (
              <FilterChip
                key={subject}
                label={subject}
                onRemove={() => onChange({ subjects: filters.subjects.filter((chosen) => chosen !== subject) })}
                testID={`search-filter-subject-${subject}`}
              />
            ))}
            {filters.latestEditionOnly ? null : (
              <FilterChip label="All editions" onRemove={() => onChange({ latestEditionOnly: true })} testID="search-filter-all-editions" />
            )}
          </View>
        ) : null}
      </View>

      {menuOpen && rowAt !== null ? (
        <View style={[styles.menu, { left: rowAt.x, top: rowAt.y + MENU_TOP }]} accessibilityRole="menu" testID="search-sort-menu">
          <Text style={styles.menuLabel}>SORT BY</Text>
          {CATALOG_SORTS.map((sort) => {
            const chosen = sort === filters.sort;
            return (
              <Pressable
                key={sort}
                accessibilityRole="menuitem"
                accessibilityState={{ checked: chosen }}
                onPress={() => choose(sort)}
                style={[styles.option, chosen && styles.optionChosen]}
                testID={`search-sort-${sort}`}
              >
                <Text style={styles.optionText}>{CATALOG_SORT_LABELS[sort]}</Text>
                {chosen ? <CheckIcon color={colors.black} size={18} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chipTarget: { height: minTouchTarget, justifyContent: "center", marginVertical: -CHIP_TOUCH_INSET },
  chip: {
    height: CHIP_HEIGHT,
    paddingHorizontal: spacing.inset,
    borderRadius: radii.chip,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.black },
  chipText: { fontFamily: fontFamily.medium, fontSize: fontSize.caption, lineHeight: 16, color: colors.black },
  filterChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  filterChipTarget: { height: minTouchTarget, justifyContent: "center", marginVertical: -(minTouchTarget - FILTER_CHIP_HEIGHT) / 2 },
  filterChip: {
    height: FILTER_CHIP_HEIGHT,
    borderRadius: radii.filterChip,
    backgroundColor: colors.selected,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingLeft: 10,
    paddingRight: spacing.xs,
  },
  filterChipText: { fontFamily: fontFamily.medium, fontSize: fontSize.caption, lineHeight: 16, color: colors.primary },
  // Above the count and the results that follow it, so the open menu covers them.
  menu: {
    position: "absolute",
    zIndex: 1,
    width: 230,
    backgroundColor: colors.white,
    borderRadius: radii.popupMenu,
    padding: spacing.sm,
    // Android draws an outer boxShadow from 9 (API 28) on; before that the menu would have no edge over the results.
    ...(Platform.OS === "android" && Platform.Version < 28 ? { elevation: 8 } : { boxShadow: popupMenuShadow }),
  },
  menuLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.listLabel,
    lineHeight: 15,
    letterSpacing: 0.84,
    color: colors.textMuted,
    paddingHorizontal: spacing.inset,
    paddingTop: 6,
    paddingBottom: spacing.xs,
  },
  option: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: spacing.inset,
    borderRadius: radii.menuOption,
  },
  optionChosen: { backgroundColor: colors.menuChosen },
  optionText: { fontFamily: fontFamily.regular, fontSize: fontSize.listRow, lineHeight: 19, color: colors.black },
});
