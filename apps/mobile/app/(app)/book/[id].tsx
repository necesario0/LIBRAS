import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, useMember } from "../../../src/auth/AuthContext";
import { BookInfo } from "../../../src/book/BookInfo";
import { useBook } from "../../../src/catalog/useBook";
import { Button } from "../../../src/components/Button";
import { CloseIcon } from "../../../src/components/icons";
import { colors, fontFamily, fontSize, radii, spacing } from "../../../src/theme/tokens";

/** The sheet starts this far down the screen: 200 pt of the 874 pt Figma frame. */
const SHEET_TOP = 200 / 874;

/**
 * A Book, opened from a search result: the Figma "Book detail" sheet (node
 * 609:1066) over the screen that opened it. Its details and how many Copies
 * exist and are available come from the API. The Borrow and Hold actions
 * arrive with the tickets that build them.
 */
export default function BookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const member = useMember();
  const { request } = useAuth();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { state, retry } = useBook(request, id);
  const close = () => (router.canGoBack() ? router.back() : router.replace("/home"));

  return (
    <View style={styles.screen}>
      <Pressable accessibilityLabel="Close" onPress={close} style={{ height: height * SHEET_TOP }} testID="book-backdrop" />
      <View style={styles.sheet} testID="book-sheet">
        <View style={styles.grabber} />
        <View style={styles.close}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} hitSlop={8} testID="book-close">
            <CloseIcon />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
          showsVerticalScrollIndicator={false}
        >
          {state.status === "loading" ? <ActivityIndicator color={colors.primary} style={styles.spinner} testID="book-loading" /> : null}
          {state.status === "loaded" ? <BookInfo book={state.book} accountType={member.accountType} /> : null}
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
  grabber: { alignSelf: "center", marginTop: 10, width: 56, height: 10, borderRadius: 58, backgroundColor: colors.grabber },
  close: { position: "absolute", right: 20, top: 20, zIndex: 1 },
  content: { paddingTop: 42, paddingHorizontal: spacing.xl, gap: spacing.xl },
  spinner: { marginTop: spacing.xxl },
  message: { borderWidth: 1, borderColor: colors.panelBorder, borderRadius: radii.panel, padding: spacing.lg, gap: spacing.sm, marginTop: spacing.xl },
  failed: { borderColor: colors.error },
  messageTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.body, color: colors.black },
  failedTitle: { color: colors.danger },
  messageBody: { fontFamily: fontFamily.regular, fontSize: fontSize.label, color: colors.textSecondary, marginBottom: spacing.sm },
});
