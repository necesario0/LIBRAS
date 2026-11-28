import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import type { ComponentRef } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { POLICY_DOCUMENTS, policyDocumentKind } from "@libras/shared";
import type { PolicyDocumentKind } from "@libras/shared";
import { BackButton } from "../src/account/BackButton";
import { useScreenTop } from "../src/hooks/useScreenTop";
import { SegmentControl } from "../src/my-books/SegmentControl";
import type { Segment } from "../src/my-books/SegmentControl";
import { LEGAL_DOCUMENTS } from "../src/policies/legal-documents";
import { colors, fontFamily, fontSize, lineHeightFor, radii, spacing } from "../src/theme/tokens";

/**
 * Full LIBRAS Terms and Conditions and Data Privacy Policy, opened either
 * from sign-up consent or from Help and policies (`?doc=terms` or `?doc=privacy`).
 */
export default function TermsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ doc?: string }>();
  const screenTop = useScreenTop();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const requested = policyDocumentKind(params.doc);
  const [selected, setSelected] = useState<PolicyDocumentKind>(requested);

  useEffect(() => {
    setSelected(requested);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [requested]);

  const selectDoc = (next: PolicyDocumentKind) => {
    setSelected(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  // Opened as the first screen (a link), there is nothing to go back to. Asked of this screen's
  // navigation, not the router: see `routerGlobalRef` in eslint.config.js.
  const back = () => (navigation.canGoBack() ? router.back() : router.replace("/"));
  const doc = LEGAL_DOCUMENTS[selected];
  const segments: readonly Segment<PolicyDocumentKind>[] = POLICY_DOCUMENTS.map((kind) => ({
    key: kind,
    label: LEGAL_DOCUMENTS[kind].tabLabel,
    dot: false,
    testID: `terms-tab-${kind}`,
  }));

  return (
    <View style={[styles.screen, { paddingTop: screenTop }]}>
      <View style={styles.header}>
        <BackButton onPress={back} testID="terms-back" />
        <Text style={styles.screenTitle} accessibilityRole="header" numberOfLines={1}>
          Terms and policies
        </Text>
      </View>

      <View style={styles.tabs}>
        <SegmentControl segments={segments} selected={selected} onSelect={selectDoc} />
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.meta}>
          <Text style={styles.docTitle} accessibilityRole="header" testID="terms-doc-title">
            {doc.title}
          </Text>
          {doc.organizationLines.map((line) => (
            <Text key={line} style={styles.orgLine}>
              {line}
            </Text>
          ))}
          <Text style={styles.metaLine}>
            {`${doc.effectiveDate} · ${doc.version}`}
          </Text>
          <View style={styles.draftBox}>
            <Text style={styles.draftText}>{doc.draftNote}</Text>
          </View>
        </View>

        {doc.sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.sectionHeading} accessibilityRole="header">
              {section.heading}
            </Text>
            {section.blocks.map((block, blockIndex) =>
              block.kind === "paragraph" ? (
                <Text key={`${section.heading}-p-${blockIndex}`} style={styles.body}>
                  {block.text}
                </Text>
              ) : (
                <View key={`${section.heading}-b-${blockIndex}`} style={styles.bullets}>
                  {block.items.map((item, itemIndex) => (
                    <View key={`${section.heading}-i-${itemIndex}`} style={styles.bulletRow}>
                      <Text style={styles.bulletMark} accessibilityElementsHidden>
                        {"•"}
                      </Text>
                      <View style={styles.bulletBody}>
                        <Text style={styles.body}>
                          {item.lead === undefined ? null : <Text style={styles.bulletLead}>{`${item.lead} `}</Text>}
                          {item.text}
                        </Text>
                        {item.url === undefined ? null : (
                          <Text
                            accessibilityRole="link"
                            onPress={() => void Linking.openURL(item.url ?? "")}
                            style={styles.link}
                          >
                            {item.url}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              ),
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.home, marginTop: 6 },
  screenTitle: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.title,
    letterSpacing: -1.4,
    lineHeight: lineHeightFor(fontSize.title),
    color: colors.black,
  },
  tabs: { paddingHorizontal: spacing.home, marginTop: spacing.lg, marginBottom: spacing.sm },
  content: { paddingHorizontal: spacing.home, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.xl },
  meta: { gap: spacing.xs },
  docTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bookTitle,
    lineHeight: lineHeightFor(fontSize.bookTitle),
    color: colors.black,
  },
  orgLine: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.small,
    lineHeight: lineHeightFor(fontSize.small),
    color: colors.textSecondary,
  },
  metaLine: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    lineHeight: lineHeightFor(fontSize.caption),
    color: colors.textMuted,
    marginTop: 2,
  },
  draftBox: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.panel,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  draftText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    lineHeight: lineHeightFor(fontSize.caption),
    color: colors.textSecondary,
  },
  section: { gap: spacing.sm },
  sectionHeading: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.body,
    lineHeight: lineHeightFor(fontSize.body),
    color: colors.black,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.label,
    lineHeight: lineHeightFor(fontSize.label),
    color: colors.textSecondary,
  },
  bullets: { gap: spacing.sm },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  bulletMark: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.label,
    lineHeight: lineHeightFor(fontSize.label),
    color: colors.brandInk,
  },
  bulletBody: { flex: 1, gap: 2 },
  bulletLead: { fontFamily: fontFamily.semiBold, color: colors.ink },
  link: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
    lineHeight: lineHeightFor(fontSize.caption),
    color: colors.primary,
    textDecorationLine: "underline",
  },
});
