import type { BottomTabBarProps } from "expo-router/js-tabs";
import { useEffect, useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fontFamily, fontSize, radii, spacing, tabBar, tabBarShadow } from "../theme/tokens";
import { useTabBarHidden } from "./TabBarVisibility";

/** How far the bar floats above the bottom edge: the preview's 18 pt, or clear of Android's navigation bar. */
function useBarBottom(): number {
  const { bottom } = useSafeAreaInsets();
  return Math.max(tabBar.bottom, bottom + spacing.sm);
}

/** The room a tab screen leaves under its content so the floating bar never covers the end of it. */
export function useTabBarSpace(): number {
  return useBarBottom() + tabBar.height + spacing.lg;
}

function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setShown(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}

/**
 * The floating tab bar of the signed-in screens (Figma style, laid out as the
 * approved Tier 3 preview): a white pill over the bottom of the screen with
 * one icon and label per tab, the active one in blue. Each tab's `title`,
 * `tabBarIcon`, `tabBarButtonTestID` and `tabBarItemStyle` come from the tabs layout; a
 * `tabBarBadge` shows as a red dot, never a number. It steps aside while the
 * keyboard is up and while a tab screen asks (`useHideTabBar`).
 */
export function FloatingTabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const bottom = useBarBottom();
  const keyboardShown = useKeyboardShown();
  const hidden = useTabBarHidden();
  if (hidden || keyboardShown) return null;

  return (
    <View style={[styles.bar, { bottom }]} accessibilityRole="tablist" testID="tab-bar">
      {state.routes.map((route, index) => {
        const descriptor = descriptors[route.key];
        if (descriptor === undefined) return null;
        const { options } = descriptor;
        const focused = index === state.index;
        const color = focused ? colors.primary : colors.black;
        const label = options.title ?? route.name;
        const dot = options.tabBarBadge !== undefined;

        const onPress = () => {
          const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigateToTab(route.key);
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={dot ? `${label}, needs your attention` : label}
            onPress={onPress}
            style={[styles.tab, options.tabBarItemStyle]}
            testID={options.tabBarButtonTestID}
          >
            {options.tabBarIcon?.({ focused, color, size: tabBar.icon })}
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {label}
            </Text>
            {dot ? <View style={styles.dot} testID={`${options.tabBarButtonTestID ?? route.name}-dot`} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: tabBar.side,
    right: tabBar.side,
    height: tabBar.height,
    flexDirection: "row",
    borderRadius: radii.tabBar,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.white,
    boxShadow: tabBarShadow,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  label: { fontFamily: fontFamily.medium, fontSize: fontSize.caption, lineHeight: 15 },
  dot: {
    position: "absolute",
    top: 12,
    left: "50%",
    marginLeft: 7,
    width: tabBar.dot,
    height: tabBar.dot,
    borderRadius: tabBar.dot / 2,
    borderWidth: 2,
    borderColor: colors.white,
    backgroundColor: colors.error,
  },
});
