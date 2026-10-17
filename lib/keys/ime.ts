import type * as React from "react"

/**
 * Whether a key belongs to an input method mid-word (Japanese, Chinese,
 * Korean): its Enter picks a candidate, so it's never a field's Enter. Safari
 * confirms a candidate with an Enter whose keyCode is 229 and whose
 * isComposing is false. Pure.
 */
export function isComposingKey(e: Pick<KeyboardEvent, "isComposing" | "keyCode">): boolean {
  return e.isComposing || e.keyCode === 229
}

/**
 * A text field's onKeyDown that leaves an input method's keys to it: the
 * handler never hears the Enter that picks a word or the Escape that drops
 * one (isComposingKey), and hears every other key as before. A field made in
 * code (a DOM listener) asks isComposingKey itself.
 *
 *   <Input onKeyDown={fieldKeyDown((e) => { if (e.key === "Enter") save() })} />
 */
export function fieldKeyDown<T extends Element>(handler: React.KeyboardEventHandler<T>): React.KeyboardEventHandler<T> {
  return (e) => {
    if (isComposingKey(e.nativeEvent)) return
    handler(e)
  }
}
