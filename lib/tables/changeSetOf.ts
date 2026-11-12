/** The change set a row write's answer names (V-360): null when it changed nothing; none (undefined) from a server before. */
export type SetOf<T> = (answer: T) => string | null | undefined

/** Its change_set: the one reader for the table's undo order and a write's Undo toast (V-529). */
export const changeSetOf: SetOf<unknown> = (a) => (a as { change_set?: string | null } | undefined)?.change_set
