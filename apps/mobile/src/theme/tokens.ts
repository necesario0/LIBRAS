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
  /** The "already have an account?" link of the welcome screen. */
  linkSubtle: "#383333",
  /** Failure state, for error messages. Not in the Figma frames read so far. */
  danger: "#B3261E",
  /** Sign-up screens: the "SIGN UP" button, and the second CTA colour of the design. */
  accent: "#FCBF49",
  /** Required-field asterisks and field error text (Figma "ff4a4a"). */
  error: "#FF4A4A",
  /** Light grey: radio outlines, upcoming steps, panel and option borders. */
  border: "#D9D9D9",
  /** Fill of the selected account type row. */
  selected: "#CEF2FF",
  /** The "(optional)" hint next to a field label. */
  hint: "#878787",
  /** Secondary copy inside a panel ("We sent an email to"). */
  textSecondary: "#565656",
  /** Border of the college list. */
  listBorder: "#111C4E",
  /** Border of a panel that holds a message. */
  panelBorder: "rgba(0,0,0,0.32)",
  /** The highlighted word of a heading ("Show this to the librarian", Figma 617:3265). */
  highlight: "#FFA800",
} as const;

/** Raised cards (Figma 617:3265: x 0, y 7, blur 17.9, black 25%). */
export const cardShadow = "0px 7px 17.9px rgba(0, 0, 0, 0.25)";

/** Montserrat is the only family. Keys are the names registered with `useFonts`. */
export const fontFamily = {
  regular: "Montserrat_400Regular",
  medium: "Montserrat_500Medium",
  semiBold: "Montserrat_600SemiBold",
} as const;

/** Sizes seen in the frames, largest first. */
export const fontSize = {
  display: 40,
  heading: 36,
  hero: 35,
  /** "Show this to the librarian". */
  headline: 32,
  title: 26,
  subheading: 20,
  body: 16,
  note: 15,
  label: 14,
  small: 13,
  caption: 12,
} as const;

export const typography = {
  display: { fontFamily: fontFamily.regular, fontSize: fontSize.display },
  heading: { fontFamily: fontFamily.regular, fontSize: fontSize.heading },
  hero: { fontFamily: fontFamily.regular, fontSize: fontSize.hero },
  subheading: { fontFamily: fontFamily.regular, fontSize: fontSize.subheading },
  note: { fontFamily: fontFamily.regular, fontSize: fontSize.note },
  label: { fontFamily: fontFamily.regular, fontSize: fontSize.label },
  caption: { fontFamily: fontFamily.semiBold, fontSize: fontSize.caption },
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
  /** Account type rows and the account type "Continue" button. */
  option: 16,
  /** The "Continue" button of the sign-up forms. */
  formButton: 28,
  /** Message panels. */
  panel: 12,
  /** The college list. */
  list: 10,
  /** The dashed frame around the Digital ID (Figma 617:3265). */
  ticket: 15,
  /** The outlined "Cancel request" button of the Digital ID screen. */
  outlineButton: 46,
} as const;

/** Height of text fields and buttons. */
export const controlHeight = 44;

/** Height of the outlined button of the borrow flow (Figma 617:3265). */
export const outlineButtonHeight = 61;

/** The status bar area of a Figma phone frame. Screens position their content from below it. */
export const statusBarHeight = 62;
