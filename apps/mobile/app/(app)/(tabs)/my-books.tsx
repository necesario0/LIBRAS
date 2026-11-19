import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { myBooksStartSegment } from "@libras/shared";
import type { MyBooksSegment } from "@libras/shared";
import { Toast } from "../../../src/components/Toast";
import { useScreenTop } from "../../../src/hooks/useScreenTop";
import { HoldsSegment } from "../../../src/my-books/HoldsSegment";
import { LoansSegment } from "../../../src/my-books/LoansSegment";
import { SavedSegment } from "../../../src/my-books/SavedSegment";
import type { SavedMessage } from "../../../src/my-books/SavedSegment";
import { useMyBooks } from "../../../src/my-books/MyBooksContext";
import { SegmentControl } from "../../../src/my-books/SegmentControl";
import type { Segment } from "../../../src/my-books/SegmentControl";
import { useTabBarSpace } from "../../../src/navigation/FloatingTabBar";
import { colors, fontFamily, fontSize, spacing } from "../../../src/theme/tokens";

/** `/my-books?segment=holds` opens My Books on that segment, once. */
function segmentParam(value: string | string[] | undefined): MyBooksSegment | undefined {
  return value === "loans" || value === "holds" || value === "saved" ? value : undefined;
}

/**
 * The My Books tab, laid out as the approved Tier 3 preview. For a Member who
 * can borrow: the Loans and Holds segments, the former My Loans and My Holds
 * screens with every action they had (Renew, Cancel Hold, Show my Digital ID).
 * It opens on Holds when a Hold is ready and on Loans otherwise, each time the
 * tab comes into focus, unless a link names the segment
 * (`/my-books?segment=loans`). A segment that needs the Member has a dot, as
 * the tab has.
 *
 * A Member who cannot borrow (a loan limit of zero) has no segments: the tab
 * is "Saved" and shows only Saved books. Everyone else has Saved as the third
 * segment. Removing a Saved book shows a message with Undo at the foot.
 */
export default function MyBooksScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ segment?: string }>();
  const { loans, holds, canBorrow, attention, reload } = useMyBooks();
  const screenTop = useScreenTop();
  const tabBarSpace = useTabBarSpace();
  const [chosen, setChosen] = useState<MyBooksSegment | undefined>(undefined);
  // The Loans and Holds fetched on this visit have arrived: the segment to open on is decided from them, then kept.
  const [fresh, setFresh] = useState(false);
  const linked = segmentParam(params.segment);
  const [message, setMessage] = useState<SavedMessage | undefined>(undefined);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showMessage = useCallback((next: SavedMessage | undefined) => {
    clearTimeout(messageTimer.current);
    setMessage(next);
    if (next !== undefined) messageTimer.current = setTimeout(() => setMessage(undefined), next.undo === undefined ? MESSAGE_MS : UNDO_MS);
  }, []);
  useEffect(() => () => clearTimeout(messageTimer.current), []);

  // A link that names a segment wins once.
  useEffect(() => {
    if (linked === undefined) return;
    setChosen(linked);
    router.setParams({ segment: undefined });
  }, [linked, router]);

  // Each visit fetches again and, once that is back, opens on what is urgent; leaving the tab forgets the choice.
  useFocusEffect(
    useCallback(() => {
      let visiting = true;
      void reload().finally(() => {
        if (visiting) setFresh(true);
      });
      return () => {
        visiting = false;
        setFresh(false);
        setChosen(undefined);
        showMessage(undefined);
      };
    }, [reload, showMessage]),
  );

  const saved = canBorrow === false;
  const start = holds.status === "loaded" ? myBooksStartSegment(holds.holds) : holds.status === "error" ? "loans" : undefined;
  useEffect(() => {
    // Kept once decided, so cancelling the ready Hold does not move the Member to Loans under their finger.
    if (fresh && chosen === undefined && start !== undefined) setChosen(start);
  }, [fresh, chosen, start]);
  const selected = chosen ?? linked ?? start;

  const segments: readonly Segment<MyBooksSegment>[] = [
    { key: "loans", label: "Loans", dot: attention.loans, testID: "my-books-loans" },
    { key: "holds", label: "Holds", dot: attention.holds, testID: "my-books-holds" },
    { key: "saved", label: "Saved", dot: false, testID: "my-books-saved" },
  ];

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: screenTop, paddingBottom: tabBarSpace }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title} accessibilityRole="header" testID="my-books-title">
          {saved ? "Saved books" : "My Books"}
        </Text>

        {saved ? (
          <SavedSegment onMessage={showMessage} />
        ) : (
          <>
            <View style={styles.segments}>
              <SegmentControl segments={segments} selected={selected} onSelect={setChosen} />
            </View>
            {selected === undefined ? <ActivityIndicator color={colors.primary} style={styles.spinner} testID="my-books-loading" /> : null}
            {selected === "loans" ? <LoansSegment state={loans} reload={reload} /> : null}
            {selected === "holds" ? <HoldsSegment state={holds} reload={reload} /> : null}
            {selected === "saved" ? <SavedSegment onMessage={showMessage} /> : null}
          </>
        )}
      </ScrollView>
      {message === undefined ? null : (
        <Toast
          message={message.text}
          action={message.undo === undefined ? undefined : { label: "Undo", onPress: message.undo, testID: "saved-undo" }}
          bottom={tabBarSpace}
          testID="saved-toast"
        />
      )}
    </View>
  );
}

/** How long a message stays, and how long Undo is offered. */
const MESSAGE_MS = 2500;
const UNDO_MS = 5000;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.home },
  title: { marginTop: 10, fontFamily: fontFamily.semiBold, fontSize: fontSize.heading, letterSpacing: -2.16, lineHeight: 45, color: colors.black },
  segments: { marginTop: 18, marginBottom: spacing.sm },
  spinner: { marginTop: spacing.xl },
});
