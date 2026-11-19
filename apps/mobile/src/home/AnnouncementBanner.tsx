import { Image, Pressable, StyleSheet } from "react-native";
import type { MemberAnnouncement } from "@libras/shared";
import { colors, radii } from "../theme/tokens";

/**
 * The running Announcement at the top of Home (approved Tier 3 preview): the 2:1 banner with rounded corners and a
 * soft shadow. The title is not drawn on it; it is the banner's accessible name. Tapping opens the Announcement.
 */
export function AnnouncementBanner({ announcement, onOpen }: { announcement: MemberAnnouncement; onOpen: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Announcement: ${announcement.title}. Open it.`}
      onPress={onOpen}
      style={styles.banner}
      testID="home-announcement"
    >
      <Image source={{ uri: announcement.image.bannerUrl }} style={styles.image} resizeMode="cover" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    aspectRatio: 2,
    borderRadius: radii.card,
    backgroundColor: colors.primary,
    overflow: "hidden",
    elevation: 6,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
  },
  image: { width: "100%", height: "100%" },
});
