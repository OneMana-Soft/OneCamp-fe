/** Whether `t` is a field or an editor. */
export function isTypedInto(t: EventTarget | null): t is Element {
  return t instanceof Element && !!t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')
}
