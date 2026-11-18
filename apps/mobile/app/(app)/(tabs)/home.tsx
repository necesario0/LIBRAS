import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, BackHandler, Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth, useMember } from "../../../src/auth/AuthContext";
import { useCatalogSearch } from "../../../src/catalog/useCatalogSearch";
import { useScreenTop } from "../../../src/hooks/useScreenTop";
import { useHideTabBar } from "../../../src/navigation/TabBarVisibility";
import { useTabBarSpace } from "../../../src/navigation/FloatingTabBar";
import { BookResultRow } from "../../../src/home/BookResultRow";
import { HomeHeader } from "../../../src/home/HomeHeader";
import { SearchBar } from "../../../src/home/SearchBar";
import { NoResults, SearchFailed } from "../../../src/home/SearchMessage";
import { RecentSearches } from "../../../src/search/RecentSearches";
import { SearchModeBar } from "../../../src/search/SearchModeBar";
import { Suggestions } from "../../../src/search/Suggestions";
import { useRecentSearches } from "../../../src/search/useRecentSearches";
import { useSuggestions } from "../../../src/search/useSuggestions";
import { colors, fontFamily, fontSize, spacing } from "../../../src/theme/tokens";

/**
 * Home for a signed-in Member: the Figma "Home dashboard" layout (node
 * 1032:1994) as the approved Tier 3 preview lays it out: the greeting and the
 * search bar. Loans, Holds and the Digital ID have their own tabs, so Home is
 * about finding Books. There is no bell and no menu.
 *
 * Tapping the search bar turns Home into search mode (it is a state of Home,
 * not another route): the bar moves up with a Cancel button, the tab bar steps
 * aside, and the screen shows the Member's recent searches, then suggestions
 * while typing, then the results once a search is submitted. Cancel and the
 * Android back button return to Home.
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
  const [searchOn, setSearchOn] = useState(false);
  const recent = useRecentSearches(member.id, searchOn);
  const typing = searchOn && !search.submitted;
  const suggestions = useSuggestions(request, search.query, typing);
  const { state } = search;

  useHideTabBar(searchOn);

  const closeSearch = useCallback(() => {
    Keyboard.dismiss();
    search.reset();
    setSearchOn(false);
  }, [search]);

  // Android's back button leaves search mode (the tabs' own back would leave the app from Home).
  useFocusEffect(
    useCallback(() => {
      if (!searchOn) return undefined;
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        closeSearch();
        return true;
      });
      return () => subscription.remove();
    }, [searchOn, closeSearch]),
  );

  const submit = (text?: string) => {
    const submitted = (text ?? search.query).trim();
    if (submitted === "") return;
    Keyboard.dismiss();
    search.submit(submitted);
    recent.add(submitted);
  };

  const openBook = (id: string) => {
    // The Book page is a sheet over Home: put the keyboard away so it does not cover the page's actions.
    Keyboard.dismiss();
    router.push({ pathname: "/book/[id]", params: { id } });
  };

  const shown = state.status === "results" ? state.response : state.status === "loading" ? state.previous : undefined;

  if (!searchOn) {
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
          <SearchBar onPress={() => setSearchOn(true)} />
        </View>
        <ScrollView
          style={styles.body}
          contentContainerStyle={[styles.bodyContent, { paddingBottom: tabBarSpace }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.hint} testID="search-hint">
            Search by title, author, ISBN, accession number or call number. Small typos are fine.
          </Text>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: screenTop + 6 }]} testID="search-mode">
      <View style={styles.modeBar}>
        <SearchModeBar value={search.query} onChangeText={search.setQuery} onSubmit={() => submit()} onCancel={closeSearch} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, styles.modeContent]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {search.query.trim() === "" && !search.submitted ? (
          <RecentSearches searches={recent.searches} onPick={submit} onRemove={recent.remove} onClear={recent.clear} />
        ) : null}

        {typing && search.query.trim() !== "" ? (
          <Suggestions query={search.query} suggestions={suggestions} onTitle={openBook} onAuthor={submit} />
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
              <BookResultRow key={book.id} book={book} onPress={() => openBook(book.id)} />
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
  modeBar: { paddingHorizontal: spacing.home, paddingVertical: 4 },
  body: { flex: 1, marginTop: spacing.lg },
  bodyContent: { paddingHorizontal: spacing.home, gap: spacing.md },
  modeContent: { paddingBottom: spacing.xl },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.label, lineHeight: 20, color: colors.textMuted, paddingHorizontal: spacing.xs },
  spinner: { marginTop: spacing.xl },
  count: { fontFamily: fontFamily.semiBold, fontSize: fontSize.small, lineHeight: 18, color: colors.textMuted, marginBottom: spacing.xs },
});
