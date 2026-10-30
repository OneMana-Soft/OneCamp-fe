/** The Manual sort, the project's one order (task_rank), the list's when none is chosen. The rest is in lib/tasks/listOrder. */
export const MANUAL_SORT = { id: "task_rank", desc: false } as const

type Sort = { id: string; desc: boolean }

export const isManualSort = (sorting: readonly { id: string; desc?: boolean }[]) => !sorting.length || sorting[0].id === MANUAL_SORT.id

/** What the list asks the server to sort by: the chosen sort, or the manual order. */
export const requestSorting = (sorting: readonly { id: string; desc?: boolean }[]): Sort[] =>
  sorting.length ? sorting.map(({ id, desc }) => ({ id, desc: desc === true })) : [{ ...MANUAL_SORT }]
