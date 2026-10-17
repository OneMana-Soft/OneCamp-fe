/**
 * Lists the server pages by index (?pageIndex=&pageSize=, from 0), read a
 * page at a time as the reader scrolls. Each answer says how many pages there
 * are: pageCount, the list's count over the page size rounded up (0 for an
 * empty list). Each list that pages so wrote the rule for "a page after this
 * one" itself, and two (a project's tasks and My Tasks, on a phone) asked for
 * one past the last.
 */

/** Whether there is a page after `pageIndex`. Without a page count, there isn't. */
export function hasPageAfter(pageIndex: number, pageCount: number | undefined): boolean {
  return (pageCount ?? 0) > pageIndex + 1
}

/** Where a list read a page at a time stands with its pages. */
export interface PagingState {
  /** The page the list wants. It moves on as the reader nears the foot, a render before its request starts. */
  wanted: number
  /** The page the list's request asks for. */
  asked: number
  /** That request's answer is on its way. */
  loading: boolean
  /** That answer is in, and its rows are in the list: they reach it a render after the answer comes. */
  inList: boolean
  /** That answer's page count. */
  pageCount: number | undefined
}

/**
 * Whether more of the list is still to come: from the moment its next page is
 * wanted until the last page's rows are in it. A count made from the rows is
 * the whole list's only when this is false (a group's header says "N+" while
 * it is true, lib/tasks/grouping's groupCount).
 */
export function pagesToCome(p: PagingState): boolean {
  return p.wanted !== p.asked || p.loading || !p.inList || hasPageAfter(p.asked, p.pageCount)
}
