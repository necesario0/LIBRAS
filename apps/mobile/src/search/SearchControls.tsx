import { CATALOG_SORTS, CATALOG_SORT_LABELS } from "@libras/shared";
import type { CatalogSearchFilters, CatalogSort } from "@libras/shared";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";
import { CheckIcon, ChevronDownIcon, SlidersIcon, SortIcon } from "../components/OutlineIcons";
import { colors, fontFamily, fontSize, popupMenuShadow, radii, spacing } from "../theme/tokens";

/** The chips' height, and how far below their top the Sort menu opens. */
const CHIP_HEIGHT = 34;
const MENU_TOP = CHIP_HEIGHT + 8;

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
      style={[styles.chip, on && styles.chipOn]}
      testID={testID}
    >
      {icon}
      <Text style={styles.chipText}>{label}</Text>
      {trailing}
    </Pressable>
  );
}

/**
 * The row under the search bar in search results (approved Tier 3 preview):
 * the Sort chip, which opens a menu of the four orders just under it; the
 * one-tap Available now chip; and the Filters chip, which opens the Filters
 * sheet. The menu closes on a choice, on the Sort chip, or on Android back.
 *
 * The menu is drawn in place over the results (the row sits above them), so
 * the results area must not clip it.
 */
export function SearchControls({
  filters,
  onChange,
  onOpenFilters,
}: {
  filters: CatalogSearchFilters;
  onChange: (change: Partial<CatalogSearchFilters>) => void;
  /** Opens the Filters sheet. Until it exists the chip shows but does nothing. */
  onOpenFilters?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

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
    <View style={styles.controls}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroller}>
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
          on={filters.availableNow}
          label="Available now"
          onPress={() => {
            setMenuOpen(false);
            onChange({ availableNow: !filters.availableNow });
          }}
          icon={filters.availableNow ? <CheckIcon color={colors.black} size={14} /> : undefined}
          testID="search-available-now"
        />
        <Chip on={false} label="Filters" onPress={onOpenFilters} icon={<SlidersIcon color={colors.black} size={15} />} testID="search-filters" />
      </ScrollView>

      {menuOpen ? (
        <View style={styles.menu} accessibilityRole="menu" testID="search-sort-menu">
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
    </View>
  );
}

const styles = StyleSheet.create({
  // Above the count and the results that follow it, so the open menu covers them.
  controls: { zIndex: 1 },
  // The chips scroll sideways edge to edge, so the row reaches past the screen's side gutter.
  scroller: { marginHorizontal: -spacing.home },
  row: { gap: spacing.sm, paddingHorizontal: spacing.home },
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
  menu: {
    position: "absolute",
    top: MENU_TOP,
    left: 0,
    width: 230,
    backgroundColor: colors.white,
    borderRadius: radii.popupMenu,
    padding: spacing.sm,
    boxShadow: popupMenuShadow,
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
