import { useRouter } from "expo-router";
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CATALOG_SEARCH_MAX_QUERY_LENGTH } from "@libras/shared";
import { useAuth, useMember } from "../../../src/auth/AuthContext";
import { useCatalogSearch } from "../../../src/catalog/useCatalogSearch";
import { useScreenTop } from "../../../src/hooks/useScreenTop";
import { useTabBarSpace } from "../../../src/navigation/FloatingTabBar";
import { BookResultRow } from "../../../src/home/BookResultRow";
import { HomeHeader } from "../../../src/home/HomeHeader";
import { SearchBar } from "../../../src/home/SearchBar";
import { NoResults, SearchFailed } from "../../../src/home/SearchMessage";
import { colors, fontFamily, fontSize, spacing } from "../../../src/theme/tokens";

/**
 * Home for a signed-in Member: the Figma "Home dashboard" layout (node
 * 1032:1994) as the approved Tier 3 preview lays it out: the greeting and the
 * search bar, and under the bar the search results. Loans, Holds and the
 * Digital ID have their own tabs, so Home is about finding Books. There is no
 * bell and no menu.
 *
 * The avatar and greeting open the Profile tab.
 */
export default function HomeScreen() {
  const router = useRouter();
  const member = useMember();
  const { request } = useAuth();
  const tabBarSpace = useTabBarSpace();
  const screenTop = useScreenTop();
  const search = useCatalogSearch(request);
  const { state } = search;

  const shown = state.status === "results" ? state.response : state.status === "loading" ? state.previous : undefined;

  return (
    <View style={[styles.screen, { paddingTop: screenTop + 2 }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Profile"
          onPress={() => router.navigate("/profile")}
          testID="home-profile"
        >
          <HomeHeader firstName={member.firstName} />
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
        contentContainerStyle={[styles.bodyContent, { paddingBottom: tabBarSpace }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {state.status === "idle" ? (
          <>
            <Text style={styles.hint} testID="search-hint">
              Search by title, author, ISBN, accession number or call number. Small typos are fine.
            </Text>
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
              <BookResultRow
                key={book.id}
                book={book}
                onPress={() => {
                  // The Book page is a sheet over Home: put the keyboard away so it does not cover the page's actions.
                  Keyboard.dismiss();
                  router.push({ pathname: "/book/[id]", params: { id: book.id } });
                }}
              />
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
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.home },
  search: { paddingHorizontal: spacing.home, marginTop: 10 },
  body: { flex: 1, marginTop: spacing.lg },
  bodyContent: { paddingHorizontal: spacing.home, gap: spacing.md },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.label, color: colors.textMuted, paddingHorizontal: spacing.xs },
  spinner: { marginTop: spacing.xl },
  count: { fontFamily: fontFamily.semiBold, fontSize: fontSize.small, color: colors.textMuted, marginBottom: spacing.xs },
});
