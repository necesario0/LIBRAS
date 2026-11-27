import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, BackHandler, PanResponder, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bookSheetSnapBounds, clampBookSheetTop, resolveBookSheetRelease } from "@libras/shared";
import type { BookSheetPosition } from "@libras/shared";
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

/** How long the message after saving or removing stays. */
const MESSAGE_MS = 2500;

/**
 * A Book, opened from a search result or shelf: the Figma "Book detail" sheet
 * (node 609:1066) over the screen that opened it. Dragging the top grabber up
 * expands the sheet to fullscreen; dragging it down returns to the default
 * height or dismisses the sheet.
 *
 * Behind the sheet the screen is dimmed (`sheetScrim`), which fades in once the
 * sheet is up and fades with it as it is dragged down. Every way of closing it
 * (drag, the close button, the dimmed area, Android's back button) slides the
 * sheet down first, so the dimming fades out instead of sliding off with the
 * screen.
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

  const bounds = useMemo(() => bookSheetSnapBounds(height), [height]);
  const [position, setPosition] = useState<Exclude<BookSheetPosition, "closed">>("default");
  const positionRef = useRef<Exclude<BookSheetPosition, "closed">>("default");
  positionRef.current = position;
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  const sheetTop = useRef(new Animated.Value(bounds.defaultTop)).current;
  const currentTop = useRef(bounds.defaultTop);
  const dragStartTop = useRef(bounds.defaultTop);
  const scrollY = useRef(0);
  const closingRef = useRef(false);
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    const sub = sheetTop.addListener(({ value }) => {
      currentTop.current = value;
    });
    return () => sheetTop.removeListener(sub);
  }, [sheetTop]);

  useEffect(() => {
    if (closingRef.current) return;
    const target = positionRef.current === "expanded" ? bounds.fullTop : bounds.defaultTop;
    sheetTop.setValue(target);
    currentTop.current = target;
  }, [bounds.defaultTop, bounds.fullTop, sheetTop]);

  const snapTo = useCallback(
    (next: BookSheetPosition) => {
      const b = boundsRef.current;
      if (next === "closed") {
        if (closingRef.current) return;
        closingRef.current = true;
        Animated.timing(sheetTop, { toValue: b.closedTop, duration: 180, useNativeDriver: false }).start(() => {
          closeRef.current();
        });
        return;
      }
      setPosition(next);
      positionRef.current = next;
      const toValue = next === "expanded" ? b.fullTop : b.defaultTop;
      Animated.spring(sheetTop, { toValue, useNativeDriver: false, bounciness: 3, speed: 16 }).start();
    },
    [sheetTop],
  );

  const dismiss = useCallback(() => snapTo("closed"), [snapTo]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      dismiss();
      return true;
    });
    return () => sub.remove();
  }, [dismiss]);

  // The screen slides up with the sheet; the dimming waits until it is nearly there, so it never slides.
  const scrimIn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(scrimIn, { toValue: 1, duration: 220, delay: 180, useNativeDriver: false }).start();
  }, [scrimIn]);
  const scrimOpacity = Animated.multiply(
    scrimIn,
    sheetTop.interpolate({ inputRange: [bounds.defaultTop, bounds.closedTop], outputRange: [1, 0], extrapolate: "clamp" }),
  );

  const makeDragResponder = (allowMove: (dx: number, dy: number) => boolean) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) => allowMove(gesture.dx, gesture.dy),
      onMoveShouldSetPanResponderCapture: (_, gesture) => allowMove(gesture.dx, gesture.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragStartTop.current = currentTop.current;
        sheetTop.stopAnimation((value) => {
          dragStartTop.current = value;
          currentTop.current = value;
        });
      },
      onPanResponderMove: (_, gesture) => {
        const next = clampBookSheetTop(dragStartTop.current + gesture.dy, boundsRef.current.closedTop);
        sheetTop.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        const b = boundsRef.current;
        const releaseTop = clampBookSheetTop(dragStartTop.current + gesture.dy, b.closedTop);
        snapTo(
          resolveBookSheetRelease({
            state: positionRef.current,
            top: releaseTop,
            velocityY: gesture.vy,
            height: b.closedTop,
          }),
        );
      },
      onPanResponderTerminate: () => {
        snapTo(positionRef.current);
      },
    });

  const handlePan = useRef(makeDragResponder((dx, dy) => Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx))).current;
  const bodyPan = useRef(makeDragResponder((dx, dy) => scrollY.current <= 1 && dy > 10 && Math.abs(dy) > Math.abs(dx))).current;

  const span = Math.max(1, bounds.defaultTop);
  const topRadius = sheetTop.interpolate({ inputRange: [0, span], outputRange: [0, radii.sheet], extrapolate: "clamp" });
  const topInsetPadding = sheetTop.interpolate({ inputRange: [0, span], outputRange: [insets.top, 0], extrapolate: "clamp" });

  return (
    <View style={styles.screen}>
      {position === "expanded" ? null : (
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: scrimOpacity }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={dismiss} style={StyleSheet.absoluteFill} testID="book-backdrop" />
        </Animated.View>
      )}
      <Animated.View
        style={[
          styles.sheet,
          { top: sheetTop, borderTopLeftRadius: topRadius, borderTopRightRadius: topRadius },
        ]}
        testID="book-sheet"
      >
        <Animated.View style={[styles.handleArea, { paddingTop: topInsetPadding }]} {...handlePan.panHandlers} testID="book-grabber">
          <View style={styles.grabber} />
          <View style={styles.top}>
            {state.status === "loaded" ? (
              <SaveAction bookId={state.book.id} accountType={member.accountType} initiallySaved={state.saved} onMessage={showMessage} />
            ) : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={dismiss} hitSlop={8} testID="book-close">
              <CloseIcon />
            </Pressable>
          </View>
        </Animated.View>
        <View style={styles.body} {...bodyPan.panHandlers}>
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
            onScroll={(event) => {
              scrollY.current = event.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
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
                <Button label="Back to search" radius={radii.formButton} onPress={dismiss} testID="book-missing-back" />
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
        {message === undefined ? null : <Toast message={message} bottom={insets.bottom + spacing.xl} testID="book-toast" />}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrim: { backgroundColor: colors.sheetScrim },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    elevation: 24,
    shadowColor: colors.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 27,
    shadowOffset: { width: 9, height: 4 },
    overflow: "hidden",
  },
  handleArea: { backgroundColor: colors.white },
  grabber: { alignSelf: "center", marginTop: 10, width: 56, height: 10, borderRadius: radii.grabber, backgroundColor: colors.grabber },
  // Save and the close button share the row under the grabber (Save alone at the top right in the approved preview).
  top: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: spacing.md, paddingHorizontal: 20, paddingTop: 2, paddingBottom: 4 },
  body: { flex: 1 },
  content: { paddingTop: spacing.md, paddingHorizontal: spacing.xl, gap: spacing.xl },
  spinner: { marginTop: spacing.xxl },
  message: { borderWidth: 1, borderColor: colors.panelBorder, borderRadius: radii.panel, padding: spacing.lg, gap: spacing.sm, marginTop: spacing.xl },
  failed: { borderColor: colors.error },
  messageTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.body, color: colors.black },
  failedTitle: { color: colors.danger },
  messageBody: { fontFamily: fontFamily.regular, fontSize: fontSize.label, color: colors.textSecondary, marginBottom: spacing.sm },
});
