import { createContext, useContext } from "react";
import type { ComponentRef, RefObject } from "react";
import type { View } from "react-native";

/** A view that stays fixed at the foot of a screen, such as the sign-up step footer. */
export type PopupFloor = RefObject<ComponentRef<typeof View> | null>;

/**
 * Set by a screen with a fixed footer: a popup (the open list of a
 * `SelectField`) stops above the top of that view instead of covering it.
 */
export const PopupFloorContext = createContext<PopupFloor | undefined>(undefined);

/** The footer that popups on this screen must stay above, if the screen has one. */
export function usePopupFloor(): PopupFloor | undefined {
  return useContext(PopupFloorContext);
}
