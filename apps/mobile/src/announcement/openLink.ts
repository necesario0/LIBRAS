import { Linking } from "react-native";
import { announcementLinkSite } from "@libras/shared";
import type { AnnouncementLink } from "@libras/shared";

/** The label of an Announcement's link button: "View book" for a Book, "Open forms.gle" for a web page. */
export function linkLabel(link: AnnouncementLink): string {
  return link.kind === "book" ? "View book" : `Open ${announcementLinkSite(link.url)}`;
}

/** Opens a web link in the phone's browser, never inside the app. */
export function openInBrowser(url: string): void {
  void Linking.openURL(url).catch(() => undefined);
}
