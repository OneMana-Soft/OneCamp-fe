/**
 * Pages made with "/page", to open as soon as their block is drawn (its view
 * holds the router; the command that made the page doesn't). Opened with
 * ?new=1, so the new page's title is ready to type (newDocArrival).
 */

const toOpen = new Set<string>()

export const openWhenDrawn = (docId: string) => void toOpen.add(docId)

/** Whether a page was made to be opened at once; asked once. */
export const takeOpen = (docId: string) => toOpen.delete(docId)
