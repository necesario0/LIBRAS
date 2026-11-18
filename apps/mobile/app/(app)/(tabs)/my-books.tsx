import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { myBooksStartSegment } from "@libras/shared";
import type { MyBooksSegment } from "@libras/shared";
import { SavedTabIcon } from "../../../src/components/OutlineIcons";
import { useScreenTop } from "../../../src/hooks/useScreenTop";
import { HoldsSegment } from "../../../src/my-books/HoldsSegment";
import { LoansSegment } from "../../../src/my-books/LoansSegment";
import { useMyBooks } from "../../../src/my-books/MyBooksContext";
import { SegmentControl } from "../../../src/my-books/SegmentControl";
import type { Segment } from "../../../src/my-books/SegmentControl";
import { useTabBarSpace } from "../../../src/navigation/FloatingTabBar";
import { colors, fontFamily, fontSize, spacing } from "../../../src/theme/tokens";

/** `/my-books?segment=holds` opens My Books on that segment, once. */
function segmentParam(value: string | string[] | undefined): MyBooksSegment | undefined {
  return value === "loans" || value === "holds" ? value : undefined;
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
 * is "Saved" and shows Saved books, a placeholder until the Saved books ticket
 * fills it. That ticket also adds a Saved segment for everyone else: one more
 * entry in `segments` and one more branch below.
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
      };
    }, [reload]),
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
  ];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: screenTop, paddingBottom: tabBarSpace }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title} accessibilityRole="header" testID="my-books-title">
        {saved ? "Saved books" : "My Books"}
      </Text>

      {saved ? (
        <SavedPlaceholder />
      ) : (
        <>
          <View style={styles.segments}>
            <SegmentControl segments={segments} selected={selected} onSelect={setChosen} />
          </View>
          {selected === undefined ? <ActivityIndicator color={colors.primary} style={styles.spinner} testID="my-books-loading" /> : null}
          {selected === "loans" ? <LoansSegment state={loans} reload={reload} /> : null}
          {selected === "holds" ? <HoldsSegment state={holds} reload={reload} /> : null}
        </>
      )}
    </ScrollView>
  );
}

const RING = 64;

/** What a Member who cannot borrow sees until Saved books exist. */
function SavedPlaceholder() {
  return (
    <View style={styles.empty} testID="saved-placeholder">
      <View style={styles.ring}>
        <SavedTabIcon color={colors.textMuted} size={28} />
      </View>
      <Text style={styles.emptyTitle} accessibilityRole="header">
        No Saved books yet
      </Text>
      <Text style={styles.emptyBody}>Saving Books to read in the library is coming soon. They will be listed here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: { paddingHorizontal: spacing.home },
  title: { marginTop: 10, fontFamily: fontFamily.semiBold, fontSize: fontSize.heading, letterSpacing: -2.16, lineHeight: 45, color: colors.black },
  segments: { marginTop: 18, marginBottom: spacing.sm },
  spinner: { marginTop: spacing.xl },
  empty: { alignItems: "center", gap: spacing.sm, marginTop: 56, paddingHorizontal: spacing.xl },
  ring: { width: RING, height: RING, borderRadius: RING / 2, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  emptyTitle: { marginTop: spacing.sm, fontFamily: fontFamily.semiBold, fontSize: fontSize.body, lineHeight: 20, color: colors.black },
  emptyBody: { fontFamily: fontFamily.regular, fontSize: fontSize.small, lineHeight: 18, color: colors.textMuted, textAlign: "center" },
});
