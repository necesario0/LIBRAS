/**
 * Design tokens, defined once. The Figma file has almost no variables, so these
 * are taken from the mobile frames (login frame `136:2163`): every screen and
 * component imports from here and never writes a raw color, size or radius.
 */

export const colors = {
  /** Screen background and text on `primary`. */
  white: "#FFFFFF",
  /** Main text. */
  black: "#000000",
  /** Primary action and brand blue (Figma "progress bar"). */
  primary: "#005DC3",
  /** Text field and card fill. */
  surface: "#F0F0F0",
  /** Placeholder and secondary text. */
  textMuted: "#747474",
  /** Text links. */
  link: "#170D0D",
  /** Failure state, for error messages. Not in the Figma frames read so far. */
  danger: "#B3261E",
} as const;

/** Montserrat is the only family. Keys are the names registered with `useFonts`. */
export const fontFamily = {
  regular: "Montserrat_400Regular",
  medium: "Montserrat_500Medium",
  semiBold: "Montserrat_600SemiBold",
} as const;

/** Sizes seen in the frames: 35 (hero), 26 (brand), 16 (body and buttons), 13 (links). */
export const fontSize = {
  hero: 35,
  title: 26,
  body: 16,
  small: 13,
} as const;

export const typography = {
  hero: { fontFamily: fontFamily.regular, fontSize: fontSize.hero },
  title: { fontFamily: fontFamily.regular, fontSize: fontSize.title },
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.body },
  bodyStrong: { fontFamily: fontFamily.semiBold, fontSize: fontSize.body },
  small: { fontFamily: fontFamily.regular, fontSize: fontSize.small },
} as const;

/** 4-point scale. `screen` is the horizontal gutter of a 402 pt frame with 352 pt of content. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  screen: 25,
} as const;

export const radii = {
  /** Text fields. */
  field: 81,
  /** Buttons. */
  button: 35,
  /** Cards and panels. */
  card: 24,
} as const;

/** Height of text fields and buttons. */
export const controlHeight = 44;
