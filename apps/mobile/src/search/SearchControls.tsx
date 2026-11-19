import { CATALOG_SORTS, CATALOG_SORT_LABELS } from "@libras/shared";
import type { CatalogSearchFilters, CatalogSort } from "@libras/shared";
import { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ComponentRef, ReactNode, Ref } from "react";
import { CheckIcon, ChevronDownIcon, SlidersIcon, SortIcon } from "../components/OutlineIcons";
import { colors, fontFamily, fontSize, popupMenuShadow, radii, spacing } from "../theme/tokens";

/** Where the Sort chip is on the screen, to open its menu just under it. */
interface Anchor {
  x: number;
  y: number;
  height: number;
}

/** How far below the chip the menu opens. */
const MENU_GAP = 8;

function Chip({
  on,
  label,
  onPress,
  icon,
  trailing,
  testID,
  chipRef,
  expanded,
}: {
  on: boolean;
  label: string;
  onPress?: () => void;
  icon?: ReactNode;
  trailing?: ReactNode;
  testID: string;
  chipRef?: Ref<ComponentRef<typeof Pressable>>;
  expanded?: boolean;
}) {
  return (
    <Pressable
      ref={chipRef}
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
 * the Sort chip, which opens a menu of the four orders; the one-tap Available
 * now chip; and the Filters chip, which opens the Filters sheet.
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
  const sortChip = useRef<ComponentRef<typeof Pressable>>(null);
  const [menu, setMenu] = useState<Anchor | undefined>(undefined);

  const openMenu = () => sortChip.current?.measureInWindow((x, y, _width, height) => setMenu({ x, y, height }));
  const choose = (sort: CatalogSort) => {
    setMenu(undefined);
    if (sort !== filters.sort) onChange({ sort });
  };

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroller}>
        <Chip
          chipRef={sortChip}
          on
          label={CATALOG_SORT_LABELS[filters.sort]}
          onPress={openMenu}
          expanded={menu !== undefined}
          icon={<SortIcon color={colors.black} size={15} />}
          trailing={<ChevronDownIcon color={colors.black} size={14} />}
          testID="search-sort"
        />
        <Chip
          on={filters.availableNow}
          label="Available now"
          onPress={() => onChange({ availableNow: !filters.availableNow })}
          icon={filters.availableNow ? <CheckIcon color={colors.black} size={14} /> : undefined}
          testID="search-available-now"
        />
        <Chip
          on={false}
          label="Filters"
          onPress={onOpenFilters}
          icon={<SlidersIcon color={colors.black} size={15} />}
          testID="search-filters"
        />
      </ScrollView>

      <Modal visible={menu !== undefined} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setMenu(undefined)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(undefined)} accessibilityLabel="Close Sort" testID="search-sort-dismiss" />
        {menu === undefined ? null : (
          <View style={[styles.menu, { top: menu.y + menu.height + MENU_GAP, left: menu.x }]} accessibilityRole="menu" testID="search-sort-menu">
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
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // The chips scroll sideways edge to edge, so the row reaches past the screen's side gutter.
  scroller: { marginHorizontal: -spacing.home },
  row: { gap: spacing.sm, paddingHorizontal: spacing.home },
  chip: {
    height: 34,
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
