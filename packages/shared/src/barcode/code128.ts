/**
 * Code 128, subset C: a 1D barcode for an even number of digits, two digits per
 * symbol. Pure functions only, so the app can draw it and tests can check it.
 * See ADR 0004 for why the Digital ID uses this symbology.
 */

/**
 * The bar and space widths (in modules) of each Code 128 symbol value, in the
 * order bar, space, bar, space, bar, space. Index 103 to 105 are Start A, B and C;
 * 106 is Stop, which has a seventh element (a final 2-module bar).
 */
const PATTERNS: readonly string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const START_C = 105;
const STOP = 106;

/** The blank margin a scanner needs on each side of the bars, in modules (ISO/IEC 15417). */
export const CODE128_QUIET_ZONE_MODULES = 10;

export interface Code128Symbol {
  /** Widths in modules, alternating bar and space, starting and ending with a bar. Quiet zones not included. */
  widths: number[];
  /** Total width in modules, without quiet zones. */
  modules: number;
}

function patternOf(value: number): string {
  const pattern = PATTERNS[value];
  if (pattern === undefined) throw new RangeError(`No Code 128 symbol for value ${value}`);
  return pattern;
}

/**
 * Encodes digits as Code 128 subset C: Start C, one symbol per pair of digits,
 * the modulo-103 check symbol, Stop. Throws a RangeError unless `digits` is a
 * non-empty, even-length string of ASCII digits.
 */
export function encodeCode128C(digits: string): Code128Symbol {
  if (!/^(?:[0-9]{2})+$/.test(digits)) {
    throw new RangeError("Code 128 subset C encodes an even number of digits");
  }
  const values = [START_C];
  for (let i = 0; i < digits.length; i += 2) values.push(Number(digits.slice(i, i + 2)));
  const checksum = values.reduce((sum, value, position) => sum + value * Math.max(position, 1), 0) % 103;
  values.push(checksum, STOP);

  const widths = values.flatMap((value) => [...patternOf(value)].map(Number));
  return { widths, modules: widths.reduce((sum, width) => sum + width, 0) };
}
