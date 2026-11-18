import Svg, { Circle, Path, Rect } from "react-native-svg";
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
