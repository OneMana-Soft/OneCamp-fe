/** A touch screen: a finger is its main pointer (a phone, a tablet). The sheet rule, the shell's band and the tooltips read it here. */
export const TOUCH_QUERY = "(pointer: coarse)"

/** Whether this is a touch screen now; false on the server. */
export const isTouchScreen = () => typeof window !== "undefined" && !!window.matchMedia?.(TOUCH_QUERY)?.matches
