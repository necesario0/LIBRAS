import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { BookDetail } from "@libras/shared";
import { useAuth } from "../auth/AuthContext";
import { CallNumber } from "../book/CallNumber";
import { BottomSheet } from "../components/BottomSheet";
import { Button } from "../components/Button";
import { SunIcon } from "../components/OutlineIcons";
import { DigitalIdTicket, TICKET_INSET } from "../digital-id/DigitalIdTicket";
import { useBrightScreen } from "../digital-id/useBrightScreen";
import { colors, fontFamily, fontSize, lineHeightFor, radii, spacing } from "../theme/tokens";
import { useNewLoan } from "./useLoans";

/** The sheet's side padding (`BottomSheet`), taken from the width the barcode may use. */
const SHEET_GUTTER = 22;
const BARCODE_MAX_WIDTH = 294;

/** One numbered step: the number in a yellow disc (the borrow flow's colour), a heading, then what belongs to it. */
function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <View style={styles.step}>
      <View style={styles.disc}>
        <Text style={styles.discText}>{n}</Text>
      </View>
      <View style={styles.stepBody}>
        <Text style={styles.stepTitle}>{title}</Text>
        {children}
      </View>
    </View>
  );
}

/**
 * What the sheet holds while it is open. It lives apart from `BorrowSheet` so
 * the code is fetched, the screen lit and the desk watched only while the
 * sheet shows: `BottomSheet` mounts its content only when visible.
 */
function BorrowSteps({ book, due, onClose }: { book: BookDetail; due: string; onClose: () => void }) {
  const router = useRouter();
  const { request } = useAuth();
  const { width } = useWindowDimensions();
  useBrightScreen();
  // The Librarian confirmed the Loan at the desk: the Book page gives way to Successfully Borrowed.
  useNewLoan(request, (loan) => {
    onClose();
    router.replace({ pathname: "/borrowed", params: { loanId: loan.id } });
  });

  const edition = book.edition === null ? "" : `, ${book.edition}`;

  return (
    <View style={styles.body}>
      <Step n={1} title="Take it from the shelf">
        <Text style={styles.note} numberOfLines={2}>{`${book.title}${edition}`}</Text>
        {book.lcCallNumber === null ? (
          <Text style={styles.note}>Ask at the desk where it is shelved.</Text>
        ) : (
          <View style={styles.callNumber}>
            <CallNumber value={book.lcCallNumber} testID="borrow-sheet-call-number" />
          </View>
        )}
      </Step>
      <Step n={2} title="Show this code to the librarian">
        <Text style={styles.note}>{`They scan it, then the Book. ${due}`}</Text>
      </Step>

      <DigitalIdTicket barcodeWidth={Math.min(BARCODE_MAX_WIDTH, width - 2 * SHEET_GUTTER - TICKET_INSET)} testID="borrow-sheet" />

      <View style={styles.bright}>
        <SunIcon color={colors.textMuted} size={18} />
        <Text style={styles.brightText}>Your screen is at full brightness while this is open.</Text>
      </View>

      <Button
        label="Open my Digital ID"
        tone="muted"
        radius={radii.formButton}
        onPress={() => {
          onClose();
          router.dismissTo("/digital-id");
        }}
        testID="borrow-sheet-digital-id"
      />
    </View>
  );
}

/**
 * Borrow at the desk, over the Book page (the prototype's "Borrow sheet"): the
 * two things the Member does next, in order, without leaving the Book. First
 * the shelf, with the Book's call number; then the live Digital ID to show the
 * librarian. Nothing is recorded here: the Loan exists once the Librarian
 * confirms it, and then Successfully Borrowed replaces the Book page.
 */
export function BorrowSheet({ book, due, visible, onClose }: { book: BookDetail; due: string; visible: boolean; onClose: () => void }) {
  return (
    <BottomSheet visible={visible} title="Borrow at the desk" onClose={onClose} closeLabel="Close Borrow at the desk" testID="borrow-sheet">
      <BorrowSteps book={book} due={due} onClose={onClose} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { marginTop: spacing.lg, gap: spacing.lg },
  step: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  disc: { width: 2 * radii.stepDisc, height: 2 * radii.stepDisc, borderRadius: radii.stepDisc, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  discText: { fontFamily: fontFamily.bold, fontSize: fontSize.small, lineHeight: lineHeightFor(fontSize.small), color: colors.black },
  stepBody: { flex: 1, gap: spacing.xs, paddingTop: 3 },
  stepTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.note, lineHeight: lineHeightFor(fontSize.note), color: colors.black },
  note: { fontFamily: fontFamily.regular, fontSize: fontSize.small, lineHeight: lineHeightFor(fontSize.small), color: colors.textMuted },
  callNumber: { marginTop: spacing.xs },
  bright: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  brightText: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.caption, lineHeight: lineHeightFor(fontSize.caption), color: colors.textMuted },
});
