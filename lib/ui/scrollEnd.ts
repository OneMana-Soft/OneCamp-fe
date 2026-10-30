/** Whether a scrolled list is within `within` px of its end. Pure. */
export const nearEnd = (el: Pick<HTMLElement, "scrollTop" | "scrollHeight" | "clientHeight">, within: number) => el.scrollHeight - el.scrollTop - el.clientHeight < within
