/**
 * Whether a key belongs to an input method mid-word (Japanese, Chinese,
 * Korean): its Enter picks a candidate, so it's never a field's Enter. Safari
 * confirms a candidate with an Enter whose keyCode is 229 and whose
 * isComposing is false. Pure.
 */
export function isComposingKey(e: Pick<KeyboardEvent, "isComposing" | "keyCode">): boolean {
  return e.isComposing || e.keyCode === 229
}
