import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CATALOG_SEARCH_MAX_QUERY_LENGTH } from "@libras/shared";
import { useAuth, useMember } from "../../src/auth/AuthContext";
import { useCatalogSearch } from "../../src/catalog/useCatalogSearch";
import { DigitalIdEntry } from "../../src/digital-id/DigitalIdEntry";
import { useScreenTop } from "../../src/hooks/useScreenTop";
import { BookResultRow } from "../../src/home/BookResultRow";
import { HomeHeader } from "../../src/home/HomeHeader";
import { SearchBar } from "../../src/home/SearchBar";
import { NoResults, SearchFailed } from "../../src/home/SearchMessage";
import { colors, fontFamily, fontSize, radii, spacing } from "../../src/theme/tokens";

/**
 * Home for a signed-in Member: the Figma "Home dashboard" layout (node
 * 1032:1994), trimmed to what Tier 1 builds. The greeting and the search bar
 * are there, and under them the entry to the Digital ID; the recommendation
 * sections and the Loans and Holds summary arrive with the tickets that build
 * them. The results replace those sections under the search bar.
 *
 * Signing out stays reachable from here (a small button where the design has
 * the notification and menu buttons, which lead nowhere yet).
 */
export default function HomeScreen() {
  const member = useMember();
  const { request, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const screenTop = useScreenTop();
  const search = useCatalogSearch(request);
  const { state } = search;

  const shown = state.status === "results" ? state.response : state.status === "loading" ? state.previous : undefined;

  return (
    <View style={[styles.screen, { paddingTop: screenTop + 2 }]}>
      <View style={styles.header}>
        <HomeHeader firstName={member.firstName} />
        <Pressable
          accessibilityRole="button"
          onPress={() => void signOut()}
          style={styles.signOut}
          testID="home-sign-out"
        >
          <Text style={styles.signOutLabel}>Sign out</Text>
        </Pressable>
      </View>
      <View style={styles.search}>
        <SearchBar
          value={search.query}
          onChangeText={search.setQuery}
          onSubmit={() => {
            Keyboard.dismiss();
            search.submit();
          }}
          maxLength={CATALOG_SEARCH_MAX_QUERY_LENGTH}
        />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {state.status === "idle" ? (
          <>
            <Text style={styles.hint} testID="search-hint">
              Search by title, author, ISBN, accession number or call number. Small typos are fine.
            </Text>
            <DigitalIdEntry />
          </>
        ) : null}

        {state.status === "loading" && shown === undefined ? (
          <ActivityIndicator color={colors.primary} style={styles.spinner} testID="search-loading" />
        ) : null}

        {shown !== undefined ? (
          <View testID="search-results">
            <Text style={styles.count} testID="search-count">
              {shown.total === 1 ? "1 book" : shown.total > shown.results.length ? `Top ${shown.results.length} of ${shown.total} books` : `${shown.total} books`}
            </Text>
            {shown.results.map((book) => (
              <BookResultRow key={book.id} book={book} />
            ))}
          </View>
        ) : null}

        {state.status === "empty" ? <NoResults query={state.query} /> : null}
        {state.status === "error" ? <SearchFailed message={state.message} onRetry={search.retry} /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.home,
  },
  signOut: { backgroundColor: colors.accent, borderRadius: radii.button, paddingHorizontal: spacing.md, height: 36, justifyContent: "center" },
  signOutLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.caption, color: colors.black },
  search: { paddingHorizontal: spacing.home, marginTop: 10 },
  body: { flex: 1, marginTop: spacing.lg },
  bodyContent: { paddingHorizontal: spacing.home, gap: spacing.md },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.label, color: colors.textMuted, paddingHorizontal: spacing.xs },
  spinner: { marginTop: spacing.xl },
  count: { fontFamily: fontFamily.semiBold, fontSize: fontSize.small, color: colors.textMuted, marginBottom: spacing.xs },
});
