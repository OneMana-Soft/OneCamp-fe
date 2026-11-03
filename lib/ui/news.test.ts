import { afterEach, describe, expect, it, vi } from "vitest"
import { showNews } from "./news"

const tick = () => new Promise((r) => setTimeout(r, 0))

/**
 * The toaster, as news meets it: show(mark) draws a toast marked
 * data-news={mark} a moment later (React's commit), and its hide closes it
 * (data-state closed) and takes it away a moment after that.
 */
function toaster() {
  const shown: string[] = []
  const hidden: string[] = []
  const show = vi.fn((mark: string) => {
    shown.push(mark)
    const li = document.createElement("li")
    li.dataset.news = mark
    li.dataset.state = "open"
    setTimeout(() => document.body.append(li), 0)
    return () => {
      hidden.push(mark)
      li.dataset.state = "closed"
      setTimeout(() => li.remove(), 0)
    }
  })
  /** The person closes the toast, or its time runs out. */
  const closeUp = () => {
    const li = document.querySelector<HTMLElement>('[data-news][data-state="open"]')!
    li.dataset.state = "closed"
  }
  const up = () => document.querySelectorAll('[data-news][data-state="open"]').length
  return { show, shown, hidden, closeUp, up }
}

function surface() {
  const el = document.createElement("div")
  el.setAttribute("data-work-surface", "")
  document.body.append(el)
  return el
}

// Every watch a test starts is called off, and the fake toaster's late
// frames are let through, before the page is cleared for the next test.
const started: Array<() => void> = []
function watchNews(show: (mark: string) => () => void) {
  const cancel = showNews(show)
  started.push(cancel)
  return cancel
}

afterEach(async () => {
  started.splice(0).forEach((cancel) => cancel())
  await tick()
  await tick()
  document.body.innerHTML = ""
})

describe("news nobody asked for", () => {
  it("shows at once when nothing is in its way", async () => {
    const t = toaster()
    watchNews(t.show)
    expect(t.show).toHaveBeenCalledTimes(1)
    await tick()
    expect(t.up()).toBe(1)
  })

  it("waits for an open dialog to close, then shows once", async () => {
    document.body.innerHTML = '<div role="dialog" data-state="open"></div><div role="alertdialog" data-state="open"></div>'
    const t = toaster()
    watchNews(t.show)
    await tick()
    expect(t.show).not.toHaveBeenCalled()
    document.querySelector('[role="dialog"]')!.setAttribute("data-state", "closed")
    await tick()
    expect(t.show, "an alert dialog is still open").not.toHaveBeenCalled()
    document.querySelector('[role="alertdialog"]')!.remove()
    await tick()
    expect(t.show).toHaveBeenCalledTimes(1)
  })

  it("waits while a work surface is up (a board's page, a call's stage), and shows on the next ordinary page", async () => {
    const board = surface()
    const t = toaster()
    watchNews(t.show)
    await tick()
    expect(t.show).not.toHaveBeenCalled()
    board.remove()
    await tick()
    expect(t.show).toHaveBeenCalledTimes(1)
    await tick()
    expect(t.up()).toBe(1)
  })

  it("waits while a surface's mark is set on an element already there, and shows once it is taken off", async () => {
    document.body.innerHTML = '<div id="stage" data-work-surface=""></div>'
    const t = toaster()
    watchNews(t.show)
    document.getElementById("stage")!.removeAttribute("data-work-surface")
    await tick()
    expect(t.show).toHaveBeenCalledTimes(1)
  })

  it("steps aside when a work surface or a dialog comes while it is up, and comes back once it has gone", async () => {
    const t = toaster()
    watchNews(t.show)
    await tick()
    expect(t.up()).toBe(1)

    const board = surface()
    await tick()
    expect(t.hidden, "the board opened").toHaveLength(1)
    await tick()
    expect(t.up()).toBe(0)
    board.remove()
    await tick()
    expect(t.show, "back on the next page").toHaveBeenCalledTimes(2)
    await tick()
    expect(t.up()).toBe(1)

    document.body.insertAdjacentHTML("beforeend", '<div role="dialog" data-state="open"></div>')
    await tick()
    expect(t.hidden, "a dialog opened").toHaveLength(2)
    document.querySelector('[role="dialog"]')!.setAttribute("data-state", "closed")
    await tick()
    expect(t.show).toHaveBeenCalledTimes(3)
    // The same news each time: one mark.
    expect(new Set(t.shown).size).toBe(1)
  })

  it("isn't taken for gone before its toast is drawn", async () => {
    const t = toaster()
    watchNews(t.show)
    // Something else changes before the toast's first frame.
    document.body.append(document.createElement("p"))
    await tick()
    await tick()
    expect(t.up()).toBe(1)
    surface()
    await tick()
    expect(t.hidden, "still watched: a board opening takes it down").toHaveLength(1)
  })

  it("is done once it closes by itself: a board opened later brings nothing back", async () => {
    const t = toaster()
    watchNews(t.show)
    await tick()
    t.closeUp()
    await tick()
    const board = surface()
    await tick()
    board.remove()
    await tick()
    expect(t.hidden).toEqual([])
    expect(t.show).toHaveBeenCalledTimes(1)
  })

  it("can be called off while it waits", async () => {
    document.body.innerHTML = '<div role="alertdialog" data-state="open"></div>'
    const t = toaster()
    const cancel = watchNews(t.show)
    cancel()
    document.body.innerHTML = ""
    await tick()
    expect(t.show).not.toHaveBeenCalled()
  })

  it("gives each piece of news its own mark", () => {
    const a = toaster()
    const b = toaster()
    watchNews(a.show)
    watchNews(b.show)
    expect(a.shown[0]).not.toBe(b.shown[0])
  })
})
