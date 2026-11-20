import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { announcementDatesLine } from "@libras/shared";
import { api } from "../../src/api";
import { linkLabel, openInBrowser } from "../../src/announcement/openLink";
import { ZoomableImage } from "../../src/announcement/ZoomableImage";
import { useAuth } from "../../src/auth/AuthContext";
import { Button } from "../../src/components/Button";
import { useFetch } from "../../src/hooks/useFocusedFetch";
import { useScreenTop } from "../../src/hooks/useScreenTop";
import { PushedHeader } from "../../src/navigation/PushedHeader";
import { colors, fontFamily, fontSize, lineHeightFor, spacing } from "../../src/theme/tokens";

/**
 * The running Announcement in full (approved Tier 3 preview): back at the top left, the whole poster (pinch to
 * zoom), the title, the dates, the text, and the link button when there is one. It reads Home again, so it shows
 * what is running now; if the Announcement ended meanwhile it says so.
 */
export default function AnnouncementScreen() {
  const router = useRouter();
  const { request } = useAuth();
  const screenTop = useScreenTop();
  const { width } = useWindowDimensions();
  const { state, reload } = useFetch(request, api.getHome, "The Announcement could not be loaded.");
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    void reload();
  }, [reload]);

  const announcement = state.status === "loaded" ? state.announcement : null;
  const posterWidth = width - 2 * spacing.home;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: screenTop }]} scrollEnabled={!zoomed} showsVerticalScrollIndicator={false}>
        <PushedHeader title="Announcement" testID="announcement-back" />
        <View style={styles.body}>
          {state.status === "loading" ? <ActivityIndicator color={colors.primary} style={styles.spinner} testID="announcement-loading" /> : null}
          {state.status === "error" ? (
            <View testID="announcement-error">
              <Text style={styles.text}>{state.message}</Text>
              <Text style={styles.retry} accessibilityRole="button" onPress={() => void reload()} testID="announcement-retry">
                Try again
              </Text>
            </View>
          ) : null}
          {state.status === "loaded" && announcement === null ? (
            <Text style={styles.text} testID="announcement-over">
              This Announcement is over.
            </Text>
          ) : null}
          {announcement === null ? null : (
            <>
              <ZoomableImage
                uri={announcement.image.posterUrl}
                width={posterWidth}
                height={Math.round((posterWidth * announcement.image.posterHeight) / announcement.image.posterWidth)}
                accessibilityLabel={`${announcement.title} poster`}
                onZoomedChange={setZoomed}
                testID="announcement-poster"
              />
              <Text style={styles.zoomHint}>Pinch to zoom</Text>
              <Text style={styles.title} accessibilityRole="header" testID="announcement-title">
                {announcement.title}
              </Text>
              <Text style={styles.dates} testID="announcement-dates">
                {announcementDatesLine(announcement.firstDay, announcement.lastDay)}
              </Text>
              {announcement.body === null ? null : (
                <Text style={styles.text} testID="announcement-body">
                  {announcement.body}
                </Text>
              )}
              {announcement.link === null ? null : (
                <View style={styles.action}>
                  <Button
                    label={linkLabel(announcement.link)}
                    testID="announcement-link"
                    onPress={() => {
                      const { link } = announcement;
                      if (link === null) return;
                      if (link.kind === "book") router.push({ pathname: "/book/[id]", params: { id: link.bookId } });
                      else openInBrowser(link.url);
                    }}
                  />
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: { paddingBottom: spacing.xxl },
  body: { paddingHorizontal: spacing.home, marginTop: spacing.md },
  spinner: { marginTop: spacing.xl },
  zoomHint: { marginTop: spacing.sm, fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: lineHeightFor(fontSize.caption), color: colors.textMuted, textAlign: "center" },
  title: { marginTop: spacing.md, fontFamily: fontFamily.semiBold, fontSize: fontSize.large, letterSpacing: -1, lineHeight: lineHeightFor(fontSize.large), color: colors.black },
  dates: { marginTop: 2, fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: lineHeightFor(fontSize.caption), color: colors.textMuted },
  text: { marginTop: spacing.md, fontFamily: fontFamily.regular, fontSize: fontSize.label, lineHeight: lineHeightFor(fontSize.label), color: colors.textMuted },
  retry: { marginTop: spacing.sm, fontFamily: fontFamily.medium, fontSize: fontSize.label, lineHeight: lineHeightFor(fontSize.label), color: colors.primary },
  action: { marginTop: spacing.lg },
});
