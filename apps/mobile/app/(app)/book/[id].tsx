import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, useMember } from "../../../src/auth/AuthContext";
import { BookInfo } from "../../../src/book/BookInfo";
import { useBook } from "../../../src/catalog/useBook";
import { useClearance } from "../../../src/clearance/useClearance";
import { Button } from "../../../src/components/Button";
import { Toast } from "../../../src/components/Toast";
import { CloseIcon } from "../../../src/components/icons";
import { useGoBack } from "../../../src/hooks/useGoBack";
import { HoldAction } from "../../../src/holds/HoldAction";
import { BorrowAction } from "../../../src/loans/BorrowAction";
import { SaveAction } from "../../../src/saved-books/SaveAction";
import { colors, fontFamily, fontSize, radii, spacing } from "../../../src/theme/tokens";

/** The sheet starts this far down the screen: 200 pt of the 874 pt Figma frame. */
const SHEET_TOP = 200 / 874;

/** How long the message after saving or removing stays. */
const MESSAGE_MS = 2500;

/**
 * A Book, opened from a search result: the Figma "Book detail" sheet (node
 * 609:1066) over the screen that opened it. Its details and how many Copies
 * exist and are available come from the API. Borrow shows when a Copy is
 * available and opens the Digital ID; the Hold action shows when none is. A
 * Member who is not in Good standing is told why in place of either. Save, at
 * the top beside the close button, keeps the Book in the Member's Saved books and says what changed.
 */
export default function BookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const member = useMember();
  const { request } = useAuth();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { state, retry } = useBook(request, id);
  // Whether the Member may borrow or place a Hold now; until it loads (or if it fails) the actions show as usual.
  const { state: standing } = useClearance(request);
  const goodStanding = standing.status === "loaded" ? standing.goodStanding : undefined;
  const close = useGoBack();
  const [message, setMessage] = useState<string | undefined>(undefined);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showMessage = useCallback((text: string) => {
    clearTimeout(messageTimer.current);
    setMessage(text);
    messageTimer.current = setTimeout(() => setMessage(undefined), MESSAGE_MS);
  }, []);
  useEffect(() => () => clearTimeout(messageTimer.current), []);

  return (
    <View style={styles.screen}>
      <Pressable accessibilityLabel="Close" onPress={close} style={{ height: height * SHEET_TOP }} testID="book-backdrop" />
      <View style={styles.sheet} testID="book-sheet">
        <View style={styles.grabber} />
        <View style={styles.top}>
          {state.status === "loaded" ? (
            <SaveAction bookId={state.book.id} accountType={member.accountType} initiallySaved={state.saved} onMessage={showMessage} />
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} hitSlop={8} testID="book-close">
            <CloseIcon />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
          showsVerticalScrollIndicator={false}
        >
          {state.status === "loading" ? <ActivityIndicator color={colors.primary} style={styles.spinner} testID="book-loading" /> : null}
          {state.status === "loaded" ? (
            <>
              <BookInfo book={state.book} accountType={member.accountType} />
              <BorrowAction book={state.book} accountType={member.accountType} goodStanding={goodStanding} />
              <HoldAction book={state.book} accountType={member.accountType} goodStanding={goodStanding} />
            </>
          ) : null}
          {state.status === "missing" ? (
            <View style={styles.message} testID="book-missing">
              <Text style={styles.messageTitle} accessibilityRole="header">
                Book not found
              </Text>
              <Text style={styles.messageBody}>{state.message}</Text>
              <Button label="Back to search" radius={radii.formButton} onPress={close} testID="book-missing-back" />
            </View>
          ) : null}
          {state.status === "error" ? (
            <View style={[styles.message, styles.failed]} testID="book-error">
              <Text style={[styles.messageTitle, styles.failedTitle]} accessibilityRole="alert">
                This Book did not open
              </Text>
              <Text style={styles.messageBody}>{state.message}</Text>
              <Button label="Try again" radius={radii.formButton} onPress={retry} testID="book-retry" />
            </View>
          ) : null}
        </ScrollView>
        {message === undefined ? null : <Toast message={message} bottom={insets.bottom + spacing.xl} testID="book-toast" />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  sheet: {
    flex: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    elevation: 24,
    shadowColor: colors.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 27,
    shadowOffset: { width: 9, height: 4 },
  },
  grabber: { alignSelf: "center", marginTop: 10, width: 56, height: 10, borderRadius: radii.grabber, backgroundColor: colors.grabber },
  // Save and the close button share the row under the grabber (Save alone at the top right in the approved preview).
  top: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: spacing.md, paddingHorizontal: 20 },
  content: { paddingTop: spacing.md, paddingHorizontal: spacing.xl, gap: spacing.xl },
  spinner: { marginTop: spacing.xxl },
  message: { borderWidth: 1, borderColor: colors.panelBorder, borderRadius: radii.panel, padding: spacing.lg, gap: spacing.sm, marginTop: spacing.xl },
  failed: { borderColor: colors.error },
  messageTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.body, color: colors.black },
  failedTitle: { color: colors.danger },
  messageBody: { fontFamily: fontFamily.regular, fontSize: fontSize.label, color: colors.textSecondary, marginBottom: spacing.sm },
});
