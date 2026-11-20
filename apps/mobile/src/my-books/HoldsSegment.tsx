import { useRouter } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { isActiveHold } from "@libras/shared";
import type { Hold } from "@libras/shared";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/Button";
import { ClockIcon } from "../components/OutlineIcons";
import { HoldRow } from "../holds/HoldRow";
import { cancelHold, holdFailureMessage } from "../holds/useHolds";
import type { HoldsState } from "../holds/useHolds";
import { colors, radii } from "../theme/tokens";
import { EmptyState } from "./EmptyState";
import { panelStyles as styles } from "./panelStyles";

/**
 * The Holds segment of My Books (the Tier 2 My Holds screen): the Member's
 * Holds in two groups, Active (waiting, ready for pickup) and Past (borrowed,
 * expired, cancelled). A ready Hold shows the end of its Pickup Window and the
 * way to the Digital ID; a waiting or ready Hold can be cancelled.
 */
export function HoldsSegment({ state, reload }: { state: HoldsState; reload: () => Promise<void> }) {
  const router = useRouter();
  const { request } = useAuth();

  const cancel = async (hold: Hold) => {
    try {
      await cancelHold(request, hold.id);
    } catch (error) {
      // The Hold may have changed since the list was loaded: show the refusal, then the truth.
      void reload();
      throw new Error(holdFailureMessage(error, "Your Hold could not be cancelled. Please try again."), { cause: error });
    }
    await reload();
  };
  const showDigitalId = () => router.navigate("/digital-id");

  const active = state.status === "loaded" ? state.holds.filter((hold) => isActiveHold(hold.status)) : [];
  const past = state.status === "loaded" ? state.holds.filter((hold) => !isActiveHold(hold.status)) : [];

  return (
    <View style={styles.segment} testID="holds-segment">
      {state.status === "loading" ? <ActivityIndicator color={colors.primary} style={styles.spinner} testID="holds-loading" /> : null}

      {state.status === "error" ? (
        <View style={[styles.panel, styles.failed]} testID="holds-error">
          <Text style={[styles.panelTitle, styles.failedTitle]} accessibilityRole="alert">
            Your Holds did not load
          </Text>
          <Text style={styles.panelBody}>{state.message}</Text>
          <Button label="Try again" radius={radii.formButton} onPress={() => void reload()} testID="holds-retry" />
        </View>
      ) : null}

      {state.status === "loaded" && state.holds.length === 0 ? (
        <EmptyState
          icon={<ClockIcon color={colors.textMuted} size={28} />}
          title="No Holds yet"
          line="When a Book has no available Copy, open it and place a Hold to join the queue."
          testID="holds-empty"
        />
      ) : null}

      {active.length > 0 ? (
        <View testID="holds-active">
          <Text style={styles.section}>Active</Text>
          {active.map((hold) => (
            <HoldRow key={hold.id} hold={hold} onCancel={cancel} onShowDigitalId={showDigitalId} />
          ))}
        </View>
      ) : null}

      {past.length > 0 ? (
        <View testID="holds-past">
          <Text style={styles.section}>Past</Text>
          {past.map((hold) => (
            <HoldRow key={hold.id} hold={hold} onCancel={cancel} onShowDigitalId={showDigitalId} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
