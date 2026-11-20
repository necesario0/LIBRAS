import { useMemo, useRef, useState } from "react";
import { Animated, PanResponder, StyleSheet, Text, View } from "react-native";
import type { GestureResponderEvent } from "react-native";
import { colors, fontFamily, fontSize, lineHeightFor, radii, spacing } from "../theme/tokens";

const MAX_ZOOM = 4;

interface Touch {
  pageX: number;
  pageY: number;
}

const distance = (a: Touch, b: Touch) => Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

interface Props {
  uri: string;
  width: number;
  height: number;
  accessibilityLabel: string;
  /** Called when the image becomes zoomed in (true) or back to its fitted size (false), so the screen can stop scrolling while the Member drags the image. */
  onZoomedChange: (zoomed: boolean) => void;
  testID?: string;
}

/**
 * An image the Member can pinch to zoom (up to 4 times) and drag while zoomed. React Native's own pinch
 * zoom works on iOS only, so this follows two fingers itself: it takes over the touch when a second finger
 * lands, or when one finger moves while zoomed. Letting go below the fitted size snaps back to it.
 */
export function ZoomableImage({ uri, width, height, accessibilityLabel, onZoomedChange, testID }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const state = useRef({ scale: 1, x: 0, y: 0, pinchStart: 0, scaleStart: 1, panStartX: 0, panStartY: 0, zoomed: false });
  const zoomedChange = useRef(onZoomedChange);
  zoomedChange.current = onZoomedChange;
  const [failed, setFailed] = useState(false);
  // Bumped by Try again, so the image is made anew and loads again.
  const [attempt, setAttempt] = useState(0);

  const responder = useMemo(() => {
    const apply = (nextScale: number, x: number, y: number) => {
      const s = state.current;
      // The image keeps covering its frame: it can be dragged only as far as its zoomed edge.
      const limitX = (width * (nextScale - 1)) / 2;
      const limitY = (height * (nextScale - 1)) / 2;
      s.scale = nextScale;
      s.x = clamp(x, -limitX, limitX);
      s.y = clamp(y, -limitY, limitY);
      scale.setValue(s.scale);
      translateX.setValue(s.x);
      translateY.setValue(s.y);
      const zoomed = nextScale > 1.01;
      if (zoomed !== s.zoomed) {
        s.zoomed = zoomed;
        zoomedChange.current(zoomed);
      }
    };
    const begin = (touches: readonly Touch[]) => {
      const s = state.current;
      const [a, b] = touches;
      if (a !== undefined && b !== undefined) {
        s.pinchStart = distance(a, b);
        s.scaleStart = s.scale;
      }
      s.panStartX = s.x;
      s.panStartY = s.y;
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (event: GestureResponderEvent) => event.nativeEvent.touches.length >= 2 || state.current.scale > 1.01,
      onMoveShouldSetPanResponderCapture: (event: GestureResponderEvent) => event.nativeEvent.touches.length >= 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => begin(event.nativeEvent.touches as unknown as Touch[]),
      onPanResponderMove: (event, gesture) => {
        const touches = event.nativeEvent.touches as unknown as Touch[];
        const s = state.current;
        const [a, b] = touches;
        if (a !== undefined && b !== undefined) {
          if (s.pinchStart === 0) begin(touches);
          apply(clamp(s.scaleStart * (distance(a, b) / s.pinchStart), 1, MAX_ZOOM), s.x, s.y);
          return;
        }
        // A finger lifted mid-pinch: the drag continues from where the image is.
        if (s.pinchStart !== 0) {
          s.pinchStart = 0;
          s.panStartX = s.x - gesture.dx;
          s.panStartY = s.y - gesture.dy;
        }
        apply(s.scale, s.panStartX + gesture.dx, s.panStartY + gesture.dy);
      },
      onPanResponderRelease: () => {
        state.current.pinchStart = 0;
        if (state.current.scale < 1.05) apply(1, 0, 0);
      },
      onPanResponderTerminate: () => {
        state.current.pinchStart = 0;
      },
    });
  }, [width, height, scale, translateX, translateY]);

  return (
    <View style={[styles.frame, { width, height }]} {...responder.panHandlers} testID={testID}>
      {failed ? (
        <View style={styles.failed} testID={testID === undefined ? undefined : `${testID}-failed`}>
          <Text style={styles.failedText} accessibilityRole="alert">
            The poster did not load.
          </Text>
          <Text
            style={styles.retry}
            accessibilityRole="button"
            onPress={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
            testID={testID === undefined ? undefined : `${testID}-retry`}
          >
            Try again
          </Text>
        </View>
      ) : (
        <Animated.Image
          key={attempt}
          source={{ uri }}
          accessible
          accessibilityLabel={accessibilityLabel}
          onError={() => setFailed(true)}
          resizeMode="contain"
          style={{ width, height, transform: [{ translateX }, { translateY }, { scale }] }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // The approved preview's soft shadow under the poster (0 4px 14px at 15 %).
  frame: {
    overflow: "hidden",
    borderRadius: radii.option,
    backgroundColor: colors.surface,
    elevation: 4,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
  },
  failed: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xl },
  failedText: { fontFamily: fontFamily.regular, fontSize: fontSize.label, lineHeight: lineHeightFor(fontSize.label), color: colors.textMuted, textAlign: "center" },
  retry: { fontFamily: fontFamily.medium, fontSize: fontSize.label, lineHeight: lineHeightFor(fontSize.label), color: colors.primary },
});
