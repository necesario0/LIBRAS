import { useFocusEffect, useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, BackHandler, Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth, useMember } from "../../../src/auth/AuthContext";
import { api } from "../../../src/api";
import { useCatalogSearch } from "../../../src/catalog/useCatalogSearch";
import { useFetch, useFocusedFetch } from "../../../src/hooks/useFocusedFetch";
import { useScreenTop } from "../../../src/hooks/useScreenTop";
import { useHideTabBar } from "../../../src/navigation/TabBarVisibility";
import { useTabBarSpace } from "../../../src/navigation/FloatingTabBar";
import { SearchResultRow } from "../../../src/home/BookResultRow";
import { HomeHeader } from "../../../src/home/HomeHeader";
import { HomeShelves, ShelvesFailed } from "../../../src/home/HomeShelves";
import { SearchBar } from "../../../src/home/SearchBar";
import { NoResults, SearchFailed } from "../../../src/home/SearchMessage";
import { FiltersSheet } from "../../../src/search/FiltersSheet";
import type { SubjectOptions } from "../../../src/search/FiltersSheet";
import { RecentSearches } from "../../../src/search/RecentSearches";
import { SearchControls } from "../../../src/search/SearchControls";
import { SearchModeBar } from "../../../src/search/SearchModeBar";
import { Suggestions } from "../../../src/search/Suggestions";
import { useRecentSearches } from "../../../src/search/useRecentSearches";
import { useSuggestions } from "../../../src/search/useSuggestions";
import { colors, fontFamily, fontSize, spacing } from "../../../src/theme/tokens";
import { DEFAULT_CATALOG_SEARCH_FILTERS, activeFilterCount, memberCollege, subjectFilterOptions } from "@libras/shared";
import type { CatalogSearchResponse } from "@libras/shared";

/** "12 results", "1 result" or "Top 20 of 64 results", and whether older editions were folded into the rows shown. */
function resultCount(response: CatalogSearchResponse): string {
  const { total, results } = response;
  const count = total === 1 ? "1 result" : total > results.length ? `Top ${results.length} of ${total} results` : `${total} results`;
  return results.some((row) => row.olderEditions.length > 0) ? `${count} · older editions folded in` : count;
}

/**
 * Home for a signed-in Member: the Figma "Home dashboard" layout (node
 * 1032:1994) as the approved Tier 3 preview lays it out: the greeting and the
 * search bar, then the shelves (New arrivals, Popular in your college,
 * Available now in your top Subject). Loans, Holds and the Digital ID have
 * their own tabs, so Home is about finding Books. There is no bell and no menu.
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
  // `/home?search=1` opens search mode, once (the empty states of My Books link here).
  const { search: searchParam } = useLocalSearchParams<{ search?: string }>();
  useEffect(() => {
    if (searchParam !== "1") return;
    setSearchOn(true);
    router.setParams({ search: undefined });
  }, [searchParam, router]);
  const recent = useRecentSearches(member.id, searchOn);
  const typing = searchOn && !search.submitted;
  const suggestions = useSuggestions(request, search.query, typing);
  const { state } = search;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const college = memberCollege(member);
  // The shelves are read again each time Home comes into view, so they follow what was borrowed meanwhile.
  const home = useFocusedFetch(request, api.getHome, "The shelves could not be loaded.");
  const subjects = useFetch(request, api.getSubjects, "The Subjects could not be loaded. Close the filters and try again.");

  // Search mode can stay open under another screen (Home is left through a Book sheet's links): the bar is hidden only while Home itself is showing.
  const homeShowing = useIsFocused();
  useHideTabBar(searchOn && homeShowing);

  const closeSearch = useCallback(() => {
    Keyboard.dismiss();
    search.reset();
    setFiltersOpen(false);
    setSearchOn(false);
  }, [search]);

  const openFilters = () => {
    Keyboard.dismiss();
    setFiltersOpen(true);
    void subjects.reload();
  };

  /** Turns every filter off, Available now too; the sort stays. */
  const clearFilters = () => search.setFilters({ ...DEFAULT_CATALOG_SEARCH_FILTERS, sort: search.filters.sort });
  const filtered = search.filters.availableNow || activeFilterCount(search.filters) > 0;

  const subjectOptions: SubjectOptions =
    subjects.state.status === "loaded"
      ? { status: "loaded", ...subjectFilterOptions(subjects.state.subjects, college) }
      : subjects.state.status === "error"
        ? { status: "error", message: subjects.state.message }
        : { status: "loading" };

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
          {home.state.status === "loaded" ? <HomeShelves shelves={home.state.shelves} onOpenBook={openBook} /> : null}
          {home.state.status === "error" ? <ShelvesFailed message={home.state.message} onRetry={() => void home.reload()} /> : null}
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

        {search.submitted && state.status !== "error" ? (
          <SearchControls filters={search.filters} onChange={search.setFilters} onOpenFilters={openFilters} />
        ) : null}

        {shown !== undefined ? (
          <View testID="search-results">
            <Text style={styles.count} testID="search-count">
              {resultCount(shown)}
            </Text>
            {shown.results.map((row) => (
              <SearchResultRow key={row.id} row={row} onOpenBook={openBook} />
            ))}
          </View>
        ) : null}

        {state.status === "empty" ? <NoResults query={state.query} filtered={filtered} onClearFilters={clearFilters} /> : null}
        {state.status === "error" ? <SearchFailed message={state.message} onRetry={search.retry} /> : null}
      </ScrollView>

      <FiltersSheet
        visible={filtersOpen}
        filters={search.filters}
        onChange={search.setFilters}
        onReset={clearFilters}
        onClose={() => setFiltersOpen(false)}
        subjects={subjectOptions}
        college={college}
        count={state.status === "results" ? state.response.total : state.status === "empty" ? 0 : undefined}
      />
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
  spinner: { marginTop: spacing.xl },
  count: { fontFamily: fontFamily.regular, fontSize: fontSize.resultNote, lineHeight: 15, color: colors.textMuted, marginTop: 2 },
});
