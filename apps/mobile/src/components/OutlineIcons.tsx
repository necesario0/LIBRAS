import Svg, { Circle, Path, Rect } from "react-native-svg";
import { colors } from "../theme/tokens";
import type { ReactNode } from "react";
import type { ColorValue } from "react-native";

/** The outline icons of the approved Tier 3 preview (tab bar, Profile rows, Digital ID): a 24 pt grid, 1.8 pt round strokes. */
export interface OutlineIconProps {
  color: ColorValue;
  size: number;
}

function Outline({ color, size, children }: OutlineIconProps & { children: ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {children}
    </Svg>
  );
}

export function HomeTabIcon(props: OutlineIconProps) {
  return (
    <Outline {...props}>
      <Path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
    </Outline>
  );
}

export function BooksTabIcon(props: OutlineIconProps) {
  return (
    <Outline {...props}>
      <Path d="M5 4h4v16H5zM10 4h4v16h-4z" />
      <Path d="m15 5 3.8-1 2.7 15.5-3.8 1z" />
    </Outline>
  );
}

/** The bookmark: the tab of a Member who cannot borrow, which holds only Saved books. */
export function SavedTabIcon(props: OutlineIconProps) {
  return (
    <Outline {...props}>
      <Path d="M6 3h12v18l-6-4.5L6 21z" />
    </Outline>
  );
}

export function DigitalIdTabIcon(props: OutlineIconProps) {
  return (
    <Outline {...props}>
      <Rect x={3} y={5} width={18} height={14} rx={2.5} />
      <Path d="M7 9v6M9.5 9v6M12 9v6M15 9v6M17 9v6" />
    </Outline>
  );
}

export function ProfileTabIcon(props: OutlineIconProps) {
  return (
    <Outline {...props}>
      <Circle cx={12} cy={12} r={9.5} />
      <Circle cx={12} cy={10} r={3.2} />
      <Path d="M6 18.5c1.4-2.2 3.5-3.3 6-3.3s4.6 1.1 6 3.3" />
    </Outline>
  );
}

/** A key: the Change password row of Profile. */
export function KeyIcon(props: OutlineIconProps) {
  return (
    <Outline {...props}>
      <Circle cx={8} cy={15} r={4} />
      <Path d="m11 12 9-9M17 6l3 3M15 8l2 2" />
    </Outline>
  );
}

/** A person: the My account row of Profile. */
export function PersonOutlineIcon(props: OutlineIconProps) {
  return (
    <Outline {...props}>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </Outline>
  );
}

/** A chevron pointing right, at what a row opens. */
export function ChevronRightIcon(props: OutlineIconProps) {
  return (
    <Outline {...props}>
      <Path d="m9 6 6 6-6 6" />
    </Outline>
  );
}

/** A sun: the note that the Digital ID keeps the screen bright. */
export function SunIcon(props: OutlineIconProps) {
  return (
    <Outline {...props}>
      <Circle cx={12} cy={12} r={4} />
      <Path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Outline>
  );
}

/** A clock: how long the Digital ID code has left. */
export function ClockIcon(props: OutlineIconProps) {
  return (
    <Outline {...props}>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 7v5l3 2" />
    </Outline>
  );
}

/** A cross: removes one recent search. */
export function CrossIcon(props: OutlineIconProps) {
  return (
    <Outline {...props}>
      <Path d="M6 6l12 12M18 6 6 18" />
    </Outline>
  );
}

/** An open book: a title suggestion. */
export function BookOutlineIcon(props: OutlineIconProps) {
  return (
    <Outline {...props}>
      <Path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <Path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
    </Outline>
  );
}

/** A magnifier: the search field of search mode. */
export function MagnifierIcon(props: OutlineIconProps) {
  return (
    <Outline {...props}>
      <Circle cx={11} cy={11} r={7} />
      <Path d="m20 20-3.6-3.6" />
    </Outline>
  );
}

/** A circled cross: empties the search field. */
export function ClearFieldIcon({ size, color }: OutlineIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <Circle cx={12} cy={12} r={10} fill={color} />
      <Path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke={colors.white} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** Two arrows, up and down: the Sort chip of search results. */
export function SortIcon(props: OutlineIconProps) {
  return (
    <Outline {...props}>
      <Path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5" />
    </Outline>
  );
}

/** A chevron pointing down: a chip that opens a menu. */
export function ChevronDownIcon(props: OutlineIconProps) {
  return (
    <Outline {...props}>
      <Path d="m6 9 6 6 6-6" />
    </Outline>
  );
}

/** A check mark: a chip that is on, the chosen option of a menu. */
export function CheckIcon(props: OutlineIconProps) {
  return (
    <Outline {...props}>
      <Path d="m5 12.5 4.5 4.5L19 7.5" />
    </Outline>
  );
}

/** Two sliders: the Filters chip of search results. */
export function SlidersIcon(props: OutlineIconProps) {
  return (
    <Outline {...props}>
      <Path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <Circle cx={16} cy={7} r={2} />
      <Circle cx={10} cy={17} r={2} />
    </Outline>
  );
}
