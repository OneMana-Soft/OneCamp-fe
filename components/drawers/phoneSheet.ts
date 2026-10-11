/**
 * Marks the shell's own phone sheets (the More sheet and the workspace
 * sheet). Their look (the pop surface at r20 and e4, no border, the 32% scrim,
 * the 36x5 grabber, the iOS curve) is now every sheet's: components/ui/drawer
 * and app/phone.css (design v3, mobile C5). Spread onto DrawerContent.
 */
export const phoneSheet = {
  "data-phone-sheet": "",
} as const
