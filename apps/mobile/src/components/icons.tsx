import { SvgXml } from "react-native-svg";
import checkXml from "../../assets/icons/check.svg";
import chevronBackXml from "../../assets/icons/chevron-back.svg";
import closeXml from "../../assets/icons/close.svg";
import homeSearchXml from "../../assets/icons/home-search.svg";
import loaderXml from "../../assets/icons/loader.svg";
import visibilityOffXml from "../../assets/icons/visibility-off.svg";
import visibilityXml from "../../assets/icons/visibility.svg";

/**
 * Icons exported from Figma, drawn from the unchanged files. Each keeps the
 * size it has in the design.
 */
interface IconProps {
  /** Degrees, clockwise. */
  rotate?: number;
}

function icon(xml: string, width: number, height: number) {
  return function Icon({ rotate = 0 }: IconProps) {
    return (
      <SvgXml xml={xml} width={width} height={height} style={rotate === 0 ? undefined : { transform: [{ rotate: `${rotate}deg` }] }} />
    );
  };
}

/** White tick on the selected radio (14 pt). */
export const CheckIcon = icon(checkXml, 14, 14);
/** Left chevron (24 pt); the design turns it to point down or up on the college field. */
export const ChevronBackIcon = icon(chevronBackXml, 24, 24);
/** Eye with a slash: the password is hidden (15 pt). */
export const VisibilityOffIcon = icon(visibilityOffXml, 15, 15);
/** Open eye: the password is shown (20.17 by 13.75 pt). */
export const VisibilityIcon = icon(visibilityXml, 20.17, 13.7523);
/** The spinner shown while a code is being checked (24 pt). */
export const LoaderIcon = icon(loaderXml, 24, 24);
/** The magnifier of the Home search bar (24 pt). */
export const SearchIcon = icon(homeSearchXml, 24, 24);
/** The round close button of a sheet (37 pt, grey disc with a dark cross). */
export const CloseIcon = icon(closeXml, 37, 37);
