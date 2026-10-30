/**
 * A settings switch's id when its caller gives none: made from its label, so
 * it is the same on every load and Search settings can land on it
 * (lib/settingsFields). useId's ids changed with the tree.
 */
export function settingIdOf(label: string): string {
  return `set-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`
}
