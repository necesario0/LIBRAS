import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

interface TabBarVisibilityValue {
  /** True while some screen asks for the tab bar to be hidden. */
  hidden: boolean;
  /** Registers one request to hide it; the returned function withdraws it. */
  hide: () => () => void;
}

const TabBarVisibilityContext = createContext<TabBarVisibilityValue | undefined>(undefined);

/** Lets a tab screen hide the floating tab bar while it needs the full height. Mounted by the tabs layout. */
export function TabBarVisibilityProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState(0);
  const hide = useCallback(() => {
    setRequests((count) => count + 1);
    let withdrawn = false;
    return () => {
      if (withdrawn) return;
      withdrawn = true;
      setRequests((count) => count - 1);
    };
  }, []);
  const value = useMemo(() => ({ hidden: requests > 0, hide }), [requests, hide]);
  return <TabBarVisibilityContext.Provider value={value}>{children}</TabBarVisibilityContext.Provider>;
}

/**
 * Hides the floating tab bar while `hidden` is true and the calling screen is
 * mounted: for example Home's search mode, which needs the room for the
 * keyboard. Screens pushed over the tabs need nothing: they cover the bar.
 */
export function useHideTabBar(hidden: boolean): void {
  const value = useContext(TabBarVisibilityContext);
  if (value === undefined) throw new Error("useHideTabBar is only for the tab screens");
  const { hide } = value;
  useEffect(() => (hidden ? hide() : undefined), [hidden, hide]);
}

/** Whether the tab bar is hidden by a screen. For the tab bar itself. */
export function useTabBarHidden(): boolean {
  return useContext(TabBarVisibilityContext)?.hidden ?? false;
}
