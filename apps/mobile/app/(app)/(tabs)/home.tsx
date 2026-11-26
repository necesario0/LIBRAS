import { useFocusEffect, useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, BackHandler, Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth, useMember } from "../../../src/auth/AuthContext";
import { api } from "../../../src/api";
import { useCatalogSearch } from "../../../src/catalog/useCatalogSearch";
import { useClearance } from "../../../src/clearance/useClearance";
import { useFetch, useFocusedFetch } from "../../../src/hooks/useFocusedFetch";
import { useScreenTop } from "../../../src/hooks/useScreenTop";
import { useHideTabBar } from "../../../src/navigation/TabBarVisibility";
import { useTabBarSpace } from "../../../src/navigation/FloatingTabBar";
import { SearchResultRow } from "../../../src/home/BookResultRow";
import { AnnouncementBanner } from "../../../src/home/AnnouncementBanner";
import { HomeHeader } from "../../../src/home/HomeHeader";
import { HomeShelves, ShelvesFailed, ShelvesLoading } from "../../../src/home/HomeShelves";
import { NotificationBell } from "../../../src/home/NotificationBell";
import { SearchBar } from "../../../src/home/SearchBar";
import { NoResults, SearchFailed } from "../../../src/home/SearchMessage";
import { FiltersSheet } from "../../../src/search/FiltersSheet";
import type { SubjectOptions } from "../../../src/search/FiltersSheet";
import { PublishedSheet } from "../../../src/search/PublishedSheet";
import type { ResultsCount } from "../../../src/search/ShowResultsButton";
import { RecentSearches } from "../../../src/search/RecentSearches";
import { SearchControls } from "../../../src/search/SearchControls";
import { SearchModeBar } from "../../../src/search/SearchModeBar";
import { Suggestions } from "../../../src/search/Suggestions";
import { useRecentSearches } from "../../../src/search/useRecentSearches";
import { useSuggestions } from "../../../src/search/useSuggestions";
import { useUnreadNotifications } from "../../../src/notifications/useUnreadNotifications";
import { StandingNotice } from "../../../src/standing/StandingNotice";
import { colors, fontFamily, fontSize, spacing } from "../../../src/theme/tokens";
import { DEFAULT_CATALOG_SEARCH_FILTERS, anyFilterOn, memberCollege, subjectFilterOptions } from "@libras/shared";
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
 * search bar, then the running Announcement as a banner (nothing when none
 * runs), then the shelves (New arrivals, Popular in your college,
 * Available now in your top Subject), drawn as grey placeholders until they
 * arrive (`ShelvesLoading`). A Member who is not in Good standing reads that
 * first, in the red `StandingNotice` above everything else. Loans, Holds and the Digital ID have
 * their own tabs, so Home is about finding Books. There is no menu. The bell at
 * the right of the header opens the Notifications screen, with a badge for the
 * unread count, read again whenever Home comes into view or the app returns to
 * the foreground.
 *
 * Tapping the search bar turns Home into search mode (it is a state of Home,
 * not another route): the bar moves up with a Cancel button, the tab bar steps
 * aside, and the screen shows the row of search controls (Sort, Available now,
 * Published, Filters) and under it the Member's recent searches, then
 * suggestions while typing, then the results once a search is submitted.
 * Filters chosen before a search wait for it: nothing is searched without
 * words. Cancel and the Android back button return to Home.
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
  const [sheet, setSheet] = useState<"filters" | "published" | null>(null);
  const college = memberCollege(member);
  // The shelves are read again each time Home comes into view, so they follow what was borrowed meanwhile.
  const home = useFocusedFetch(request, api.getHome, "The shelves could not be loaded.");
  const subjects = useFetch(request, api.getSubjects, "The Subjects could not be loaded. Close the filters and try again.");
  const unread = useUnreadNotifications();
  // Read with the shelves, so a Member who is not in Good standing learns it on Home, before the desk.
  const { state: clearance } = useClearance(request);
  const standing = clearance.status === "loaded" ? clearance.goodStanding : undefined;

  // Search mode can stay open under another screen (Home is left through a Book sheet's links): the bar is hidden only while Home itself is showing.
  const homeShowing = useIsFocused();
  useHideTabBar(searchOn && homeShowing);

  const closeSearch = useCallback(() => {
    Keyboard.dismiss();
    search.reset();
    setSheet(null);
    setSearchOn(false);
  }, [search]);

  const openFilters = () => {
    Keyboard.dismiss();
    setSheet("filters");
    void subjects.reload();
  };

  const openPublished = () => {
    Keyboard.dismiss();
    setSheet("published");
  };

  /** Turns every filter off, Available now and Published too; the sort stays. */
  const clearFilters = () => search.setFilters({ ...DEFAULT_CATALOG_SEARCH_FILTERS, sort: search.filters.sort });

  // What the sheets' button says: "Done" while no search is shown (a change then waits for the next search), else the live count.
  const resultsCount: ResultsCount = !search.submitted
    ? { kind: "no-search" }
    : state.status === "results"
      ? { kind: "counted", total: state.response.total }
      : state.status === "empty"
        ? { kind: "counted", total: 0 }
        : { kind: "counting" };

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
            style={styles.profile}
            testID="home-profile"
          >
            <HomeHeader firstName={member.firstName} />
          </Pressable>
          <NotificationBell unread={unread} onPress={() => router.push("/notifications")} />
        </View>
        <View style={styles.search}>
          <SearchBar onPress={() => setSearchOn(true)} />
        </View>
        <ScrollView
          style={styles.body}
          contentContainerStyle={[styles.bodyContent, { paddingBottom: tabBarSpace }]}
          showsVerticalScrollIndicator={false}
        >
          {standing !== undefined && !standing.inGoodStanding ? (
            <View style={styles.standing}>
              <StandingNotice title="You can’t borrow right now" reasons={standing.reasons} from="tab" outlined testID="home-standing" />
            </View>
          ) : null}
          {home.state.status === "loaded" && home.state.announcement !== null ? (
            // The shelf below brings its own 24 of space, as in the preview, so the screen's gap is taken back here.
            <View style={styles.banner}>
              <AnnouncementBanner announcement={home.state.announcement} onOpen={() => router.push("/announcement")} />
            </View>
          ) : null}
          {home.state.status === "loading" ? <ShelvesLoading /> : null}
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
        <SearchControls filters={search.filters} onChange={search.setFilters} onOpenPublished={openPublished} onOpenFilters={openFilters} />

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
              {resultCount(shown)}
            </Text>
            {shown.results.map((row) => (
              <SearchResultRow key={row.id} row={row} onOpenBook={openBook} />
            ))}
          </View>
        ) : null}

        {state.status === "empty" ? <NoResults query={state.query} filtered={anyFilterOn(search.filters)} onClearFilters={clearFilters} /> : null}
        {state.status === "error" ? <SearchFailed message={state.message} onRetry={search.retry} /> : null}
      </ScrollView>

      <FiltersSheet
        visible={sheet === "filters"}
        filters={search.filters}
        onChange={search.setFilters}
        onReset={() => search.setFilters({ subjects: [], latestEditionOnly: DEFAULT_CATALOG_SEARCH_FILTERS.latestEditionOnly })}
        onClose={() => setSheet(null)}
        subjects={subjectOptions}
        college={college}
        results={resultsCount}
      />
      <PublishedSheet
        visible={sheet === "published"}
        published={search.filters.published}
        onChange={(published) => search.setFilters({ published })}
        onClose={() => setSheet(null)}
        results={resultsCount}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, paddingHorizontal: spacing.home },
  profile: { flexShrink: 1 },
  search: { paddingHorizontal: spacing.home, marginTop: 10 },
  banner: { marginBottom: -spacing.md },
  standing: { marginTop: spacing.xs },
  modeBar: { paddingHorizontal: spacing.home, paddingVertical: 4 },
  body: { flex: 1, marginTop: spacing.lg },
  bodyContent: { paddingHorizontal: spacing.home, gap: spacing.md },
  // At least the screen tall, so the Sort menu fits inside it even over one result (see SearchControls).
  modeContent: { flexGrow: 1, paddingBottom: spacing.xl },
  spinner: { marginTop: spacing.xl },
  count: { fontFamily: fontFamily.regular, fontSize: fontSize.resultNote, lineHeight: 15, color: colors.textMuted, marginTop: 2 },
});
