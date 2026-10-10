import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { ActivityFeedFrame, FEED_SKELETON_ROWS } from "@/components/activity/activityFeedFrame"

afterEach(cleanup)

const parts = (container: HTMLElement) => {
  const frame = container.querySelector("[data-feed-frame]") as HTMLElement
  return {
    frame,
    toolbar: frame.querySelector(":scope > [data-feed-toolbar]") as HTMLElement | null,
    body: frame.querySelector(":scope > [data-feed-body]") as HTMLElement | null,
  }
}

describe("the Activity feed's frame", () => {
  // Mentions had no toolbar row, so its rows started 36px higher than All's.
  it("draws its toolbar row with or without anything in it, at one height", () => {
    const bare = parts(render(<ActivityFeedFrame loading={false}>rows</ActivityFeedFrame>).container)
    expect(bare.toolbar).toBeTruthy()
    cleanup()
    const full = parts(render(<ActivityFeedFrame loading={false} filter={<span>who</span>} actions={<button>act</button>}>rows</ActivityFeedFrame>).container)
    expect(full.toolbar!.className).toBe(bare.toolbar!.className)
    expect(full.toolbar!.className).toContain("h-9")
  })

  // The empty and error states centred their column (mx-auto) while the
  // list's started at the panel's edge.
  it("keeps the list's column whatever the body shows", () => {
    const { frame } = parts(render(<ActivityFeedFrame loading={false} state={<p>empty</p>} />).container)
    expect(frame.className).toContain("max-w-[880px]")
    expect(frame.className).not.toContain("mx-auto")
  })

  it("loads with one skeleton, rows shaped like the feed's", () => {
    const { body } = parts(render(<ActivityFeedFrame loading>rows</ActivityFeedFrame>).container)
    const rows = body!.querySelectorAll("[data-feed-skeleton] [data-feed-skeleton-row]")
    expect(rows).toHaveLength(FEED_SKELETON_ROWS)
    expect((rows[0] as HTMLElement).className).toContain("md:min-h-16")
    expect(body!.textContent).not.toContain("rows")
  })

  it("puts a state where the rows go, in place of them", () => {
    const { body } = parts(render(<ActivityFeedFrame loading={false} state={<p>nothing here</p>}>rows</ActivityFeedFrame>).container)
    expect(body!.querySelector(":scope > [data-feed-state]")?.textContent).toBe("nothing here")
    expect(body!.textContent).not.toContain("rows")
  })

  it("draws a notice between the toolbar and the rows only when there is one", () => {
    const quiet = render(<ActivityFeedFrame loading={false}>rows</ActivityFeedFrame>).container
    expect(quiet.querySelector("[data-feed-notice]")).toBeNull()
    cleanup()
    const told = render(<ActivityFeedFrame loading={false} notice={<p>the drill ran</p>}>rows</ActivityFeedFrame>).container
    const order = [...told.querySelector("[data-feed-frame]")!.children].map((c) => Object.keys((c as HTMLElement).dataset)[0])
    expect(order).toEqual(["feedToolbar", "feedNotice", "feedBody"])
  })
})
