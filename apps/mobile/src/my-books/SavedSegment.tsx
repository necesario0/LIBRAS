import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { SAVED_BOOK_MESSAGES } from "@libras/shared";
import type { SavedBook } from "@libras/shared";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/Button";
import { SavedTabIcon } from "../components/OutlineIcons";
import { useFocusedFetch } from "../hooks/useFocusedFetch";
import { colors, radii } from "../theme/tokens";
import { EmptyState } from "./EmptyState";
import { panelStyles as styles } from "./panelStyles";
import { SavedBookRow } from "./SavedBookRow";

/** What My Books shows at its foot: the message, and what Undo does (none for a failure). */
export interface SavedMessage {
  text: string;
  undo?: () => void;
}

interface SavedSegmentProps {
  /** Shows a message at the foot of My Books, or takes it down when called with undefined. */
  onMessage: (message: SavedMessage | undefined) => void;
}

/**
 * The Saved segment of My Books (approved Tier 3 preview): the Member's Saved
 * books, newest first, each with its availability pill. The bookmark removes a
 * Book at once and offers Undo, which saves it again. A Member who cannot
 * borrow sees only this, under the Saved tab.
 */
export function SavedSegment({ onMessage }: SavedSegmentProps) {
  const router = useRouter();
  const { request } = useAuth();
  const { state, reload } = useFocusedFetch(request, api.getSavedBooks, "Your Saved books could not be loaded. Please try again.");
  // Books removed on this screen: hidden at once, shown again if the removal fails or is undone.
  const [removed, setRemoved] = useState<readonly string[]>([]);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  // Leaving the segment takes its message down.
  useEffect(() => () => onMessageRef.current(undefined), []);

  const unhide = (bookId: string) => setRemoved((ids) => ids.filter((id) => id !== bookId));

  const undo = useCallback(
    async (book: SavedBook) => {
      onMessageRef.current(undefined);
      try {
        await request((token) => api.saveBook(token, book.bookId));
        await reload();
        unhide(book.bookId);
      } catch {
        onMessageRef.current({ text: SAVED_BOOK_MESSAGES.saveFailed });
      }
    },
    [request, reload],
  );

  const remove = async (book: SavedBook) => {
    setRemoved((ids) => [...ids, book.bookId]);
    try {
      await request((token) => api.unsaveBook(token, book.bookId));
      onMessageRef.current({ text: "Removed from Saved", undo: () => void undo(book) });
    } catch {
      unhide(book.bookId);
      onMessageRef.current({ text: SAVED_BOOK_MESSAGES.removeFailed });
    }
  };

  const open = (book: SavedBook) => router.push({ pathname: "/book/[id]", params: { id: book.bookId } });
  const shown = state.status === "loaded" ? state.savedBooks.filter((book) => !removed.includes(book.bookId)) : [];

  return (
    <View style={styles.segment} testID="saved-segment">
      {state.status === "loading" ? <ActivityIndicator color={colors.primary} style={styles.spinner} testID="saved-loading" /> : null}

      {state.status === "error" ? (
        <View style={[styles.panel, styles.failed]} testID="saved-error">
          <Text style={[styles.panelTitle, styles.failedTitle]} accessibilityRole="alert">
            Your Saved books did not load
          </Text>
          <Text style={styles.panelBody}>{state.message}</Text>
          <Button label="Try again" radius={radii.formButton} onPress={() => void reload()} testID="saved-retry" />
        </View>
      ) : null}

      {state.status === "loaded" && shown.length === 0 ? (
        <EmptyState
          icon={<SavedTabIcon color={colors.textMuted} size={28} />}
          title="No Saved books yet"
          line="Tap Save on any Book to keep it here for later."
          testID="saved-empty"
        />
      ) : null}

      {shown.length > 0 ? (
        <View testID="saved-list">
          {shown.map((book) => (
            <SavedBookRow key={book.bookId} book={book} onOpen={open} onRemove={(b) => void remove(b)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
