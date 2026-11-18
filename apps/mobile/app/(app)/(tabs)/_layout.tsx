import { Tabs } from "expo-router/js-tabs";
import { useMyBooks, MyBooksProvider } from "../../../src/my-books/MyBooksContext";
import { FloatingTabBar } from "../../../src/navigation/FloatingTabBar";
import { TabBarVisibilityProvider } from "../../../src/navigation/TabBarVisibility";
import { BooksTabIcon, DigitalIdTabIcon, HomeTabIcon, ProfileTabIcon, SavedTabIcon } from "../../../src/components/OutlineIcons";
import { colors } from "../../../src/theme/tokens";

/** The tab screens open on Home: Android's back button on another tab returns to it. */
export const unstable_settings = { initialRouteName: "home" };

/**
 * The four tabs of the signed-in app, under the floating tab bar
 * (`FloatingTabBar`): Home, My Books, Digital ID and Profile. There is no
 * drawer. A Member who cannot borrow (a loan limit of zero in their Loan
 * Policy) sees the My Books tab as "Saved", with a bookmark.
 *
 * The tabs share the Member's Loans and Holds (`MyBooksProvider`), fetched
 * again each time a tab comes into focus; the My Books tab gets a dot when a
 * Hold is ready, or a Loan is due tomorrow or overdue.
 */
export default function TabsLayout() {
  return (
    <MyBooksProvider>
      <TabBarVisibilityProvider>
        <AppTabs />
      </TabBarVisibilityProvider>
    </MyBooksProvider>
  );
}

function AppTabs() {
  const { canBorrow, attention, reload } = useMyBooks();
  const saved = canBorrow === false;

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      backBehavior="firstRoute"
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.white } }}
      screenListeners={{ focus: () => void reload() }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: "Home", tabBarIcon: (icon) => <HomeTabIcon {...icon} />, tabBarButtonTestID: "tab-home" }}
      />
      <Tabs.Screen
        name="my-books"
        options={{
          title: saved ? "Saved" : "My Books",
          tabBarIcon: (icon) => (saved ? <SavedTabIcon {...icon} /> : <BooksTabIcon {...icon} />),
          tabBarButtonTestID: "tab-my-books",
          // Until the Loan Policy is known the tab cannot say what it is: it keeps its place, unlabelled.
          tabBarItemStyle: canBorrow === undefined ? { opacity: 0 } : undefined,
          tabBarBadge: attention.loans || attention.holds ? "" : undefined,
        }}
      />
      <Tabs.Screen
        name="digital-id"
        options={{ title: "Digital ID", tabBarIcon: (icon) => <DigitalIdTabIcon {...icon} />, tabBarButtonTestID: "tab-digital-id" }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profile", tabBarIcon: (icon) => <ProfileTabIcon {...icon} />, tabBarButtonTestID: "tab-profile" }}
      />
    </Tabs>
  );
}
