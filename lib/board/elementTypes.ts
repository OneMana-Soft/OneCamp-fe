/** The element types a board draws (V-547: elementTypes.test.ts says why; the collaboration service has the same list). */
export const BOARD_ELEMENT_TYPES: ReadonlySet<string> = new Set(["rectangle", "diamond", "ellipse", "arrow", "line", "freedraw", "text", "image", "frame", "embeddable"])

/** Whether something is an element of a type a board draws. Pure. */
export const isBoardElement = (el: unknown): boolean => typeof el === "object" && el !== null && BOARD_ELEMENT_TYPES.has((el as { type?: unknown }).type as string)
