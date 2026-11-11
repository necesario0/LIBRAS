import { useMemo } from "react";
import { PixelRatio } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { CODE128_QUIET_ZONE_MODULES, encodeCode128C } from "@libras/shared";
import { colors } from "../theme/tokens";

interface Props {
  /** An even number of digits. */
  digits: string;
  /** The widest the barcode may be, quiet zones included, in layout points. */
  maxWidth: number;
  height: number;
  testID?: string;
}

/**
 * A Code 128 subset C barcode, quiet zones included. Every module is a whole
 * number of physical pixels, so bar edges stay sharp for a camera reading the
 * screen; the barcode is as wide as that allows within `maxWidth`.
 */
export function Barcode({ digits, maxWidth, height, testID }: Props) {
  const symbol = useMemo(() => encodeCode128C(digits), [digits]);
  const totalModules = symbol.modules + 2 * CODE128_QUIET_ZONE_MODULES;
  const modulePixels = Math.max(1, Math.floor(PixelRatio.getPixelSizeForLayoutSize(maxWidth) / totalModules));
  const width = (totalModules * modulePixels) / PixelRatio.get();

  // All bars as one path, in module units: a rectangle per bar.
  const bars = useMemo(() => {
    let x = CODE128_QUIET_ZONE_MODULES;
    let path = "";
    symbol.widths.forEach((moduleWidth, index) => {
      if (index % 2 === 0) path += `M${x} 0h${moduleWidth}v1h-${moduleWidth}z`;
      x += moduleWidth;
    });
    return path;
  }, [symbol]);

  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${totalModules} 1`}
      preserveAspectRatio="none"
      accessibilityLabel="Digital ID barcode"
      testID={testID}
    >
      <Rect x={0} y={0} width={totalModules} height={1} fill={colors.white} />
      <Path d={bars} fill={colors.black} />
    </Svg>
  );
}
