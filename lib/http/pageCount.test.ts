import { describe, expect, it } from "vitest"

import { hasPageAfter, pagesToCome, type PagingState } from "./pageCount"

describe("a page after this one, by the server's page count", () => {
  it("is there while this page isn't the last", () => {
    expect(hasPageAfter(0, 3)).toBe(true)
    expect(hasPageAfter(1, 3)).toBe(true)
  })

  it("isn't there on the last page, nor past it, nor in an empty list", () => {
    // pageCount counts the pages; pageIndex counts from 0. The phone's lists
    // compared pageCount > pageIndex, and asked for page 3 of a 3-page list.
    expect(hasPageAfter(2, 3)).toBe(false)
    expect(hasPageAfter(3, 3)).toBe(false)
    expect(hasPageAfter(0, 1)).toBe(false)
    expect(hasPageAfter(0, 0)).toBe(false)
  })

  it("isn't there before the page count is known", () => {
    expect(hasPageAfter(0, undefined)).toBe(false)
  })
})

describe("whether more of a list is still to come", () => {
  // A list of two pages read to its end, each state it passes through.
  const at = (p: Partial<PagingState>): PagingState => ({ wanted: 0, asked: 0, loading: false, inList: true, pageCount: 2, ...p })

  it("is so while the first page loads, and once it is in, with a page after it", () => {
    expect(pagesToCome(at({ loading: true, inList: false, pageCount: undefined }))).toBe(true)
    expect(pagesToCome(at({ inList: false }))).toBe(true)
    expect(pagesToCome(at({}))).toBe(true)
  })

  it("is so from the moment the next page is wanted, before its request starts", () => {
    // The page number moves a render before the request does; for that render
    // the answer in hand was the first page's, and nothing was loading.
    expect(pagesToCome(at({ wanted: 1 }))).toBe(true)
  })

  it("is so while the next page loads, and when it has come but its rows aren't in the list yet", () => {
    expect(pagesToCome(at({ wanted: 1, asked: 1, loading: true, inList: false, pageCount: undefined }))).toBe(true)
    // An answer's rows reach the list a render after it comes.
    expect(pagesToCome(at({ wanted: 1, asked: 1, inList: false }))).toBe(true)
  })

  it("is so when the next page's read failed, and there is no answer to it", () => {
    expect(pagesToCome(at({ wanted: 1, asked: 1, inList: false, pageCount: undefined }))).toBe(true)
  })

  it("isn't so once the last page's rows are in the list", () => {
    expect(pagesToCome(at({ wanted: 1, asked: 1 }))).toBe(false)
    // A list of one page, and an empty one.
    expect(pagesToCome(at({ pageCount: 1 }))).toBe(false)
    expect(pagesToCome(at({ pageCount: 0 }))).toBe(false)
  })
})
