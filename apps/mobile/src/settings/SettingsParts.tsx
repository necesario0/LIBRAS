import { Children, Fragment } from "react";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRightIcon } from "../components/OutlineIcons";
import { SwitchTrack } from "../components/Toggle";
import { colors, fontFamily, fontSize, lineHeightFor, radii, spacing } from "../theme/tokens";

/** The small grey capitals above a group (approved Tier 3 preview). */
export function SectionLabel({ children }: { children: string }) {
  return (
    <Text style={styles.sectionLabel} accessibilityRole="header">
      {children.toUpperCase()}
    </Text>
  );
}

/** A bordered group of rows. */
export function SettingsGroup({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{withHairlines(children)}</View>;
}

/** The children, each after the first set off by a hairline. */
function withHairlines(children: ReactNode): ReactNode {
  return Children.toArray(children).map((child, index) => (
    <Fragment key={index}>
      {index > 0 ? <View style={styles.hairline} /> : null}
      {child}
    </Fragment>
  ));
}

interface SettingsRowProps {
  /** An outline icon of `OutlineIcons`, 20 pt. */
  icon: ReactNode;
  label: string;
  /** The small grey line under the label. */
  detail?: string;
  onPress: () => void;
  /** Whether a chevron shows: the row opens another screen. */
  opens?: boolean;
  /** `danger` is for rows that cannot be undone (Delete my account). */
  tone?: "normal" | "danger";
  /** Off while what it opens is loading. */
  disabled?: boolean;
  testID: string;
}

/** One row of a Settings group. Rows of a group are separated by a hairline. */
export function SettingsRow({ icon, label, detail, onPress, opens = false, tone = "normal", disabled = false, testID }: SettingsRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]} testID={testID}>
      {icon}
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, tone === "danger" && styles.danger]}>{label}</Text>
        {detail === undefined ? null : (
          <Text style={styles.rowDetail} testID={`${testID}-detail`}>
            {detail}
          </Text>
        )}
      </View>
      {opens ? <ChevronRightIcon color={colors.textMuted} size={18} /> : null}
    </Pressable>
  );
}

interface SettingsSwitchRowProps {
  label: string;
  /** The small grey line under the label. */
  detail: string;
  on: boolean;
  onChange: (on: boolean) => void;
  testID: string;
}

/**
 * A row of a Settings group that is an on and off switch (approved preview:
 * label and detail on the left, the switch on the right). The whole row is the
 * switch, so it is easy to hit and read out as one control.
 */
export function SettingsSwitchRow({ label, detail, on, onChange, testID }: SettingsSwitchRowProps) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={detail}
      accessibilityState={{ checked: on }}
      onPress={() => onChange(!on)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={testID}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      <SwitchTrack on={on} />
    </Pressable>
  );
}

/** The small grey line under a group (approved preview `.note`). */
export function SettingsNote({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <Text style={styles.note} testID={testID}>
      {children}
    </Text>
  );
}

/** A bordered table of label and value lines (Help and policies, Library info). */
export function FactTable({ facts, testID }: { facts: readonly { label: string; value: string }[]; testID?: string }) {
  return (
    <View style={styles.group} testID={testID}>
      {withHairlines(
        facts.map((fact) => (
          <View key={fact.label} style={styles.fact}>
            <Text style={styles.factLabel}>{fact.label}</Text>
            <Text style={styles.factValue}>{fact.value}</Text>
          </View>
        )),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    marginTop: 22,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.xs,
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.listLabel,
    lineHeight: 15,
    letterSpacing: 0.84,
    color: colors.textMuted,
  },
  group: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.option, overflow: "hidden", backgroundColor: colors.white },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 13,
    paddingHorizontal: 14,
    backgroundColor: colors.white,
  },
  hairline: { height: 1, backgroundColor: colors.pill },
  pressed: { backgroundColor: colors.surface },
  rowText: { flex: 1 },
  rowLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.listRow, lineHeight: 20, color: colors.black },
  rowDetail: { fontFamily: fontFamily.regular, fontSize: fontSize.resultNote, lineHeight: 15, color: colors.textMuted },
  danger: { color: colors.danger },
  note: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.xs,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.resultNote,
    lineHeight: lineHeightFor(fontSize.resultNote),
    color: colors.textMuted,
  },
  fact: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: 14,
  },
  factLabel: { flexShrink: 1, fontFamily: fontFamily.regular, fontSize: fontSize.listRow - 1, lineHeight: 19, color: colors.black },
  factValue: { flexShrink: 1, textAlign: "right", fontFamily: fontFamily.semiBold, fontSize: fontSize.listRow - 1, lineHeight: 19, color: colors.black },
});
