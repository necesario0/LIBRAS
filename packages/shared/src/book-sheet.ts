/** The Book sheet opens this far below the top of the screen: 200 pt of the 874 pt Figma frame. */
export const BOOK_SHEET_TOP_RATIO = 200 / 874;

/** Resting state of the draggable Book sheet. */
export type BookSheetPosition = "default" | "expanded" | "closed";

export interface BookSheetSnapBounds {
  fullTop: number;
  defaultTop: number;
  closedTop: number;
}

/** Computes the fullscreen, default, and dismissed top offsets for a viewport height. */
export function bookSheetSnapBounds(height: number): BookSheetSnapBounds {
  return {
    fullTop: 0,
    defaultTop: Math.round(height * BOOK_SHEET_TOP_RATIO),
    closedTop: height,
  };
}

/** Clamps a vertical sheet drag offset between fullscreen (0) and closed (`height`). */
export function clampBookSheetTop(top: number, height: number): number {
  return Math.max(0, Math.min(height, top));
}

/**
 * Decides where the Book sheet snaps when the Member releases a vertical drag,
 * using both how far it moved and the release velocity.
 */
export function resolveBookSheetRelease({
  state,
  top,
  velocityY,
  height,
}: {
  state: Exclude<BookSheetPosition, "closed">;
  top: number;
  velocityY: number;
  height: number;
}): BookSheetPosition {
  const { defaultTop } = bookSheetSnapBounds(height);
  if (state === "default") {
    const dismissDistance = Math.min(140, Math.round(height * 0.16));
    if (top < defaultTop - 56 || velocityY < -0.5) return "expanded";
    if (top > defaultTop + dismissDistance || velocityY > 0.65) return "closed";
    return "default";
  }

  const deepDismissTop = Math.max(defaultTop + Math.round(height * 0.45), Math.round(height * 0.72));
  if (top > deepDismissTop) return "closed";
  if (top > 72 || velocityY > 0.45) return "default";
  return "expanded";
}
