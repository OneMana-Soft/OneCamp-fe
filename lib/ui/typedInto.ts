export function isTypedInto(t: EventTarget | null): t is Element {
  return t instanceof Element && !!t.closest(':is(input,textarea):not([readonly],:disabled),select:not(:disabled),[contenteditable=""],[contenteditable="true"]')
}
