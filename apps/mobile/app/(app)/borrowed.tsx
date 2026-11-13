import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatLibraryDate, formatLibraryDay, libraryDaysBetween } from "@libras/shared";
import type { Loan } from "@libras/shared";
import badge from "../../assets/images/borrowed-badge.png";
import { useAuth } from "../../src/auth/AuthContext";
import { BookCover } from "../../src/components/BookCover";
import { CallToAction } from "../../src/components/CallToAction";
import { useScreenTop } from "../../src/hooks/useScreenTop";
import { currentLoans, useLoans } from "../../src/loans/useLoans";
import { colors, fontFamily, fontSize, outlineActionHeight, radii, spacing } from "../../src/theme/tokens";

function Fact({ label, value, color, testID }: { label: string; value: string; color: string; testID: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={[styles.factValue, { color }]} testID={testID}>
        {value}
      </Text>
    </View>
  );
}

function LoanCard({ loan, out, limit }: { loan: Loan; out: number; limit: number }) {
  const days = libraryDaysBetween(loan.checkedOutAt, loan.dueAt);
  return (
    <View style={styles.card} testID="borrowed-card">
      <View style={styles.book}>
        <View style={styles.cover}>
          <BookCover id={loan.bookId} width={59} height={88} radius={radii.cover} />
        </View>
        <View style={styles.bookText}>
          <Text style={styles.bookTitle} numberOfLines={3} testID="borrowed-title">
            {loan.bookTitle}
          </Text>
          <Text style={styles.bookAuthor} numberOfLines={1}>
            {loan.bookAuthors.length > 0 ? loan.bookAuthors.join("; ") : "Unknown author"}
          </Text>
        </View>
      </View>
      <View style={styles.rule} />
      <View style={styles.facts}>
        <Fact label="Borrowed on" value={formatLibraryDate(loan.checkedOutAt)} color={colors.black} testID="borrowed-on" />
        <Fact label="Return by" value={formatLibraryDate(loan.dueAt)} color={colors.primary} testID="borrowed-due" />
        <Fact label="Time left" value={days === 1 ? "1 day" : `${days} days`} color={colors.availableText} testID="borrowed-time-left" />
        <Fact label="Books borrowed" value={`${out} of ${limit}`} color={colors.black} testID="borrowed-count" />
      </View>
    </View>
  );
}

/**
 * "Successfully Borrowed" (Figma 617:3485): shown once the Librarian has
 * confirmed the Loan at the desk. The Digital ID screen opens it with the id of
 * the new Loan, and the details come from the API. The design's "to avoid a
 * fine" is left out: Tier 1 charges nothing.
 */
export default function BorrowedScreen() {
  const { loanId } = useLocalSearchParams<{ loanId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screenTop = useScreenTop();
  const { request } = useAuth();
  const { state } = useLoans(request);
  const loan = state.status === "loaded" ? state.loans.find((candidate) => candidate.id === loanId) : undefined;

  const home = () => router.dismissTo("/home");
  const myLoans = () => {
    router.dismissTo("/home");
    router.push("/loans");
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.screen, { paddingTop: screenTop + 12, paddingBottom: insets.bottom + 25 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.badge}>
        <Image source={badge} style={styles.badgeImage} accessibilityIgnoresInvertColors />
      </View>
      <Text style={styles.title} accessibilityRole="header" testID="borrowed-heading">
        {"Successfully\n"}
        <Text style={styles.highlight}>Borrowed</Text>
      </Text>
      <Text style={styles.subtitle}>The librarian scanned your code. Enjoy your book !</Text>

      {state.status === "loading" ? <ActivityIndicator color={colors.primary} style={styles.spinner} testID="borrowed-loading" /> : null}
      {state.status === "loaded" && loan !== undefined ? (
        <LoanCard loan={loan} out={currentLoans(state.loans).length} limit={state.loanLimit} />
      ) : null}

      <View style={styles.footer}>
        {loan !== undefined ? (
          <Text style={styles.reminder} testID="borrowed-reminder">
            {"Please return it by "}
            <Text style={styles.reminderDate}>{formatLibraryDay(loan.dueAt)}</Text>
            {"."}
          </Text>
        ) : state.status !== "loading" ? (
          <Text style={styles.reminder} testID="borrowed-reminder">
            The details are in My Loans.
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={home}
            style={({ pressed }) => [styles.action, styles.home, pressed && styles.pressed]}
            testID="borrowed-home"
          >
            <Text style={styles.homeLabel}>Home</Text>
          </Pressable>
          <View style={styles.action}>
            <CallToAction label="View My Books" onPress={myLoans} testID="borrowed-my-loans" />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.white },
  screen: { flexGrow: 1, alignItems: "center", paddingHorizontal: 21 },
  // The design shows the middle of a larger square picture: the frame clips it to the badge.
  badge: { width: 80, height: 83, overflow: "hidden" },
  badgeImage: { position: "absolute", left: -60.78, top: -59.35, width: 201.26, height: 202.2 },
  title: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.headline,
    letterSpacing: -1.28,
    color: colors.black,
    textAlign: "center",
    width: 292,
  },
  highlight: { color: colors.highlight },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.body,
    letterSpacing: -0.64,
    color: colors.textMuted,
    textAlign: "center",
    width: 337,
    marginTop: spacing.sm,
  },
  spinner: { marginTop: 22, height: 120 },
  card: {
    alignSelf: "stretch",
    marginTop: 22,
    paddingTop: 28,
    paddingBottom: 66,
    paddingLeft: 22,
    paddingRight: 27,
    gap: 17,
    borderRadius: radii.ticket,
    backgroundColor: colors.white,
    // Figma: 0, 7, blur 8.95, black 25%. Drawn as the Book sheet draws its shadow, which every Android version renders.
    elevation: 8,
    shadowColor: colors.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 8.95,
    shadowOffset: { width: 0, height: 7 },
  },
  book: { flexDirection: "row", alignItems: "center", gap: 11 },
  cover: {
    borderRadius: radii.cover,
    backgroundColor: colors.white,
    elevation: 4,
    shadowColor: colors.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 4 },
  },
  bookText: { flex: 1 },
  bookTitle: { fontFamily: fontFamily.regular, fontSize: fontSize.subheading, letterSpacing: -0.8, color: colors.black },
  bookAuthor: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, letterSpacing: -0.48, color: colors.textMuted },
  rule: { height: 1, backgroundColor: colors.textFaint },
  // The rule sits 13 pt above the first row: 17 pt of gap less 4.
  facts: { gap: 14, marginTop: -4 },
  fact: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  factLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.note, letterSpacing: -0.6, color: colors.textMuted },
  factValue: { fontFamily: fontFamily.regular, fontSize: fontSize.note, letterSpacing: -0.6 },
  footer: { alignSelf: "stretch", paddingHorizontal: 8, marginTop: 22, gap: 17 },
  reminder: { fontFamily: fontFamily.regular, fontSize: fontSize.body, letterSpacing: -0.64, color: colors.textMuted, textAlign: "center" },
  reminderDate: { color: colors.black },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  action: { flex: 1 },
  home: {
    height: outlineActionHeight,
    borderRadius: radii.outlineButton,
    borderWidth: 1,
    borderColor: colors.black,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { backgroundColor: colors.surface },
  homeLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.note, color: colors.black },
});
