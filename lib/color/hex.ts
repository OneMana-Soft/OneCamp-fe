/** Whether `text` is a "#rrggbb" colour, in either case: lib/color's one test of one. Pure. */
export const isHex = (text: string | null | undefined): text is string => !!text && /^#[0-9a-f]{6}$/i.test(text)
