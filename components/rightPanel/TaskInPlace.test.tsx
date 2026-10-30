import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import type { ReactNode } from "react"

// The sheet's code comes to the device ahead through the offline layer's warm list (lib/offline/warmAhead, its own
// tests); here only that the sheet joins it once, as it mounts. The one open rule is the router's (inPlace).
const warmAhead = vi.fn()
vi.mock("@/lib/offline/warmAhead", () => ({ warmAhead }))
// The panel's loader is the right panel's (panelLoaders): the sheet warms through it, and only that is read here.
const warmTaskParts = vi.fn(async () => {})
vi.mock("@/components/rightPanel/rightPanel", () => ({ panelLoaders: { task: async () => ({ warmTaskParts }) } }))
vi.mock("@/lib/navigation/appRouter", () => ({ inPlace: new Set() }))
// The device's tasks by key (lib/offline/keptTask): LCH-7 is kept as task-7, LCH-9 not at all.
vi.mock("@/lib/offline/keptTask", () => ({ keptTaskOf: async (key: string) => (key === "LCH-7" ? "task-7" : undefined) }))

const { default: rightPanel, openRightPanel, closeRightPanel } = await import("@/store/slice/desktopRightPanelSlice")
const { TaskInPlace } = await import("@/components/rightPanel/TaskInPlace")

function setup(body?: ReactNode) {
  const store = configureStore({ reducer: { rightPanel: rightPanel.reducer } })
  const view = render(
    <Provider store={store}>
      <TaskInPlace body={body} />
    </Provider>,
  )
  return { store, view }
}

describe("the sheet's code, ahead", () => {
  it("joins the offline layer's warm list as it mounts, before any press (V-100)", () => {
    warmAhead.mockClear()
    setup()
    expect(warmAhead).toHaveBeenCalledTimes(1)
    expect(typeof warmAhead.mock.calls[0][0]).toBe("function")
  })

  it("warms the task's panel through the right panel's own loader for it, with every part it draws", async () => {
    warmAhead.mockClear()
    warmTaskParts.mockClear()
    setup()
    await (warmAhead.mock.calls[0][0] as () => Promise<unknown>)()
    expect(warmTaskParts).toHaveBeenCalledTimes(1)
  })
})

const marked = () => document.documentElement.hasAttribute("data-task-sheet")

// app/phone.css keys the screen's foot on html[data-task-sheet] (never a :has(),
// app/selectorKeyGuard): the offline pill and the toasts sit above the sheet's
// comment box only while the sheet is open.
describe("TaskInPlace marks the page while its sheet is open", () => {
  afterEach(() => {
    cleanup()
    delete document.documentElement.dataset.taskSheet
  })

  it("on a phone: marked while a task's sheet is open, unmarked once it closes", () => {
    const { store } = setup(<p>the task</p>)
    expect(marked()).toBe(false)
    act(() => {
      store.dispatch(openRightPanel({ taskUUID: "task-1" }))
    })
    expect(marked()).toBe(true)
    act(() => {
      store.dispatch(closeRightPanel())
    })
    expect(marked()).toBe(false)
  })

  it("on a phone: unmarked when the sheet leaves with the page", () => {
    const { store, view } = setup(<p>the task</p>)
    act(() => {
      store.dispatch(openRightPanel({ taskUUID: "task-1" }))
    })
    expect(marked()).toBe(true)
    view.unmount()
    expect(marked()).toBe(false)
  })

  it("never marked for a panel that holds no task, or on a laptop, where the task opens in its column", () => {
    const phone = setup(<p>a thread</p>)
    act(() => {
      phone.store.dispatch(openRightPanel({ postUUID: "post-1" }))
    })
    expect(marked()).toBe(false)
    phone.view.unmount()

    const laptop = setup()
    act(() => {
      laptop.store.dispatch(openRightPanel({ taskUUID: "task-1" }))
    })
    expect(marked()).toBe(false)
  })
})

// With no network the one rule takes a press on a link to a task's page (lib/navigation/inPlace): the task opens over
// the page and nothing moves. A key's link (the panel's own Open the full page gives the key) opens the task the
// device keeps under that key.
describe("TaskInPlace opens a task's link in place while offline", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    document.body.innerHTML = ""
  })

  // A press on a link to `href`: whether the rule took it (held its move). The move is held after it anyway, so the
  // test's page never goes anywhere.
  const press = (href: string) => {
    const link = document.body.appendChild(document.createElement("a"))
    link.href = href
    let taken = false
    const after = (e: Event) => {
      taken = e.defaultPrevented
      e.preventDefault()
    }
    window.addEventListener("click", after)
    link.click()
    window.removeEventListener("click", after)
    return taken
  }

  it("by its id at once; by its key, as the task the device keeps under it, or by the key where it keeps none", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    const { store } = setup()
    const opened = () => store.getState().rightPanel.rightPanelState.data.taskUUID

    const id = "0f8fad5b-d9cb-469f-a165-70867728950e"
    expect(press(`/app/task/${id}`)).toBe(true)
    expect(opened()).toBe(id)
    await act(async () => {
      expect(press("/app/task/LCH-7")).toBe(true)
    })
    expect(opened()).toBe("task-7")
    await act(async () => {
      expect(press("/app/task/LCH-9")).toBe(true)
    })
    expect(opened()).toBe("LCH-9")
  })

  it("leaves a link to a task's page to the browser while online", () => {
    const { store } = setup()
    expect(press("/app/task/LCH-7")).toBe(false)
    expect(store.getState().rightPanel.rightPanelState.isOpen).toBe(false)
  })
})
