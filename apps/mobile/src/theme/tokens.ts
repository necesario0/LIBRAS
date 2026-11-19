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
  /** Wordmark ink (deep university navy). */
  brandInk: "#111C4E",
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
  /** The greeting's second line on Home ("What’s on your mind"). */
  textFaint: "#AFAFAF",
  /** Shadow of the Home search bar (Figma: black at 25%). */
  shadow: "#000000",
  /** A Copy is available: text and fill of the status pill (Figma "92% match" pill). */
  success: "#12B76A",
  successSurface: "#E5F6EC",
  /** A neutral status pill, for example no Copy available (Figma "74% match" pill). */
  pill: "#F1F1F3",
  /** Book page: the call number pill (Figma 1187:1479). */
  callNumber: "#9DCCFF",
  /** Book page: the "Available" pill and its text (Figma 614:1170, 614:1171). */
  availableSurface: "#C7FFD5",
  availableText: "#188132",
  /** Book page: body copy under a heading (Figma 617:1184). */
  textBody: "#6E6E6E",
  /** Fill of the "Overdue" pill; its text is `danger`. */
  dangerSurface: "#FDECEC",
  /** The sheet that holds a Book page (Figma 609:1159 grabber). */
  grabber: "#D9D9D9",
  /** Password screens (Figma 926:14226): headings and typed text. */
  ink: "#1A1A1F",
  /** Password screens: the intro line, unmet requirements and the success message. */
  textSubtle: "#737885",
  /** An outlined action that backs out without saving: its border and label (Cancel of the password screens, Figma 926:14378). */
  dismiss: "#D93025",
  /** The filled action that saves or confirms (Save of the password screens and the success dialog's button, Figma 926:14380, 928:14993). */
  confirm: "#F9B233",
  /** The dimmed screen behind a dialog (Figma 928:14986). */
  scrim: "rgba(0,0,0,0.55)",
  /** The hairline around the floating tab bar (black at 6%). */
  hairline: "rgba(0,0,0,0.06)",
  /** The circled cross that empties the search field. */
  clearField: "#B9B9B9",
  /** The lighter spine drawn over a placeholder Book cover. */
  coverSpine: "rgba(255,255,255,0.35)",
  /** The chosen option of the Sort menu (approved Tier 3 preview). */
  menuChosen: "#FFF6E0",
} as const;

/** The floating tab bar (approved Tier 3 preview: x 0, y 6, blur 18, black 18%). */
export const tabBarShadow = "0px 6px 18px rgba(0, 0, 0, 0.18)";

/** The rows of the Profile menu (Figma 921:13989: x 0, y 4, blur 6.5, black 25%). */
export const menuRowShadow = "0px 4px 6.5px rgba(0, 0, 0, 0.25)";

/** A menu that pops up over the screen, such as Sort (approved Tier 3 preview: x 0, y 10, blur 30, black 20%). */
export const popupMenuShadow = "0px 10px 30px rgba(0, 0, 0, 0.2)";

/** The chosen Published choice of the Filters sheet (approved Tier 3 preview: x 0, y 1, blur 3, black 15%). */
export const segmentShadow = "0px 1px 3px rgba(0, 0, 0, 0.15)";

/** The knob of an on and off switch (approved Tier 3 preview: x 0, y 1, blur 3, black 30%). */
export const switchKnobShadow = "0px 1px 3px rgba(0, 0, 0, 0.3)";

/** Montserrat is the only family. Keys are the names registered with `useFonts`. */
export const fontFamily = {
  regular: "Montserrat_400Regular",
  medium: "Montserrat_500Medium",
  semiBold: "Montserrat_600SemiBold",
  bold: "Montserrat_700Bold",
  extraLight: "Montserrat_200ExtraLight",
  /** The Book page's call number and its label (Figma: IBM Plex Mono and Roboto Mono). */
  monoLabel: "IBMPlexMono_400Regular",
  mono: "RobotoMono_400Regular",
} as const;

/** Sizes seen in the frames, largest first. */
export const fontSize = {
  display: 40,
  heading: 36,
  hero: 35,
  /** "Show this to the librarian", and the title of the password screens. */
  headline: 32,
  /** "Show this to the librarian" on the Digital ID tab (approved Tier 3 preview). */
  idHeading: 30,
  title: 26,
  /** The greeting on Home. */
  large: 24,
  /** The Member's name on Profile (approved Tier 3 preview). */
  name: 22,
  /** The title on the Book page (approved Tier 3 preview). */
  bookTitle: 21,
  subheading: 20,
  body: 16,
  note: 15,
  label: 14,
  small: 13,
  caption: 12,
  /** The tags of the Book page: edition, year and availability (approved Tier 3 preview). */
  tag: 11,
  /** Search mode (approved Tier 3 preview): the list label, the text link, a list row and the empty state heading. */
  listLabel: 10.5,
  action: 12.5,
  listRow: 14.5,
  emptyTitle: 17,
  /** Search results (approved Tier 3 preview): the count line and "Also in N older editions", then a result's year line. */
  resultNote: 11.5,
  resultMeta: 11,
  /** The LC classes next to a Subject in the Filters sheet. */
  lcClasses: 9.5,
  /** The line under the greeting on Home. */
  micro: 10,
} as const;

/**
 * The line height for a text of `size`: 1.25 times it, rounded up. Montserrat's
 * descenders ("g", "y") reach below a line any tighter, and Android cuts them
 * off, so every text that sets a line height takes it from here. React Native
 * scales it with the phone's font size, as it does the text.
 */
export function lineHeightFor(size: number): number {
  return Math.ceil(size * 1.25);
}

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
  /** The 10 pt inside a pill (menu row, read-only field, Sign out) and between the avatar and the name on Profile. */
  inset: 10,
  /** The side gutter of the Home frame, whose content is 366 pt wide on a 402 pt screen. */
  home: 18,
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
  /** The Home search bar. */
  search: 65,
  /** The sheet that holds a Book page. */
  sheet: 38,
  /** The yellow call to action of the borrow flow ("Borrow", "View My Books", Figma 617:3570). */
  callToAction: 34,
  /** A Book cover on the Book page and on Successfully Borrowed. */
  cover: 10,
  /** A small Book cover in a list row (search results, Loans, Holds). */
  coverSmall: 6,
  /** The call number pill of the Book page (Figma 1187:1479). */
  callNumber: 43,
  /** The edition and availability tags of the Book page. */
  tag: 39,
  /** The floating tab bar. */
  tabBar: 35,
  /** The segment control of My Books. */
  segments: 22,
  /** A segment of My Books, and the small outlined button of a list row (Renew, Cancel Hold). */
  segment: 18,
  /** The grabber at the top of the Book page's sheet (Figma 609:1159). */
  grabber: 58,
  /** The rounded rectangle buttons of the account frames: Log out (Figma 580:1741), Cancel and Save changes (580:1842, 580:1845). */
  actionButton: 25,
  /** A fully rounded action of `actionHeight` (Cancel and Save of the password screens, Figma 926:14377). */
  roundAction: 23,
  /** The success dialog of the password screens (Figma 928:14987). */
  dialog: 28,
  /** The round icon behind an empty state message (64 pt). */
  iconRing: 32,
  /** The Sort, Available now and Filters chips above search results (34 pt). */
  chip: 17,
  /** The Sort menu, and one option in it. */
  popupMenu: 16,
  menuOption: 10,
  /** The Published choices of the Filters sheet, and the chosen one. */
  publishedChoices: 14,
  publishedChoice: 11,
  /** An on and off switch (28 pt high). */
  switch: 14,
  switchKnob: 11,
  /** A removable filter chip under the search controls (28 pt high). */
  filterChip: 14,
  /** The round logo of the wordmark (31 pt). */
  logo: 16,
  /** The square gold accent dot beside the wordmark. */
  wordmarkDot: 2,
  /** The terms checkbox of sign-up. */
  checkbox: 6,
  /** A radio button (24 pt). */
  radio: 12,
  /** The bars of the sign-up step progress. */
  progress: 1,
} as const;

/** Height of text fields and buttons. */
export const controlHeight = 44;

/** Height of a password field (Figma 926:14350). */
export const passwordFieldHeight = 48;

/**
 * Height of the actions of the account screens: the action row of My Account
 * (Figma 580:1832), Cancel and Save of the password screens and the success
 * dialog's button (926:14377).
 */
export const actionHeight = 46;

/** Height of the outlined button of the borrow flow (Figma 617:3265). */
export const outlineButtonHeight = 61;

/** Height of the yellow call to action of the borrow flow (Figma 617:3570). */
export const callToActionHeight = 57;

/** Height of the outlined "Home" button beside it (Figma 617:3547). */
export const outlineActionHeight = 54;

/** Height of the Home search bar. */
export const searchBarHeight = 46;

/**
 * The floating tab bar of the signed-in screens (approved Tier 3 preview): 70 pt
 * high, 14 pt in from each side and at least 18 pt above the bottom edge.
 */
export const tabBar = { height: 70, side: 14, bottom: 18, icon: 25, dot: 10 } as const;

/** The status bar area of a Figma phone frame. Screens position their content from below it. */
export const statusBarHeight = 62;

/** The cover colours of the design's book placeholders (Figma Search C). A Book without a cover picture takes one by its id. */
export const bookCovers = ["#801A1A", "#3366B2", "#738C4D", "#E5C773", "#2B2B33", "#33998C"] as const;

/** A Book on a Home shelf (approved Tier 3 preview): the cover is 96 by 140 and the title and author sit under it in the same width. */
export const shelfCover = { width: 96, height: 140 } as const;

/** The title printed on a Home shelf cover: white, except on the pale yellow cover, where white could not be read. */
export const coverInk = { light: "#FFFFFF", dark: "#2B2B33", darkOn: "#E5C773" } as const;
