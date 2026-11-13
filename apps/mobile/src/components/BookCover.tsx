import { StyleSheet, View } from "react-native";
import { bookCovers, colors } from "../theme/tokens";

function coverColor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return bookCovers[hash % bookCovers.length] ?? bookCovers[0];
}

/**
 * The placeholder cover of a Book: a colour taken from its id, with a lighter
 * spine. The catalog has no cover pictures yet. The same Book always gets the
 * same colour, in the search results and on its page.
 */
export function BookCover({ id, width, height, radius }: { id: string; width: number; height: number; radius: number }) {
  return (
    <View style={{ width, height, borderRadius: radius, backgroundColor: coverColor(id), overflow: "hidden" }}>
      <View style={styles.spine} />
    </View>
  );
}

const styles = StyleSheet.create({
  spine: { position: "absolute", left: 5, top: 0, bottom: 0, width: 2, backgroundColor: colors.coverSpine },
});
