import type { ReactElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"

/**
 * react-redux runs every selector again on each change to the store and
 * renders the component again when the answer isn't the last one (by
 * identity). A fallback written in the selector, `state.x[id] || {}`, is a new
 * object on every call, so the open task panel rendered again on every
 * dispatch anywhere in the app: a draft keystroke, a message, the typing
 * sweep. Each selector these components pass is recorded as they render and
 * asked again after a change elsewhere in the store: it must give back the
 * very same value.
 */
const h = vi.hoisted(() => ({ state: undefined as unknown, selectors: [] as Array<(s: unknown) => unknown> }))

vi.mock("react-redux", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-redux")>()),
  useDispatch: () => () => {},
  useSelector: (select: (s: unknown) => unknown) => {
    h.selectors.push(select)
    return select(h.state)
  },
}))
vi.mock("@/hooks/useFetch", () => {
  const loading = { data: undefined, isLoading: true, isError: false, error: undefined, mutate: () => Promise.resolve() }
  return { useFetch: () => loading, useFetchOnlyOnce: () => loading }
})
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/app/project/p",
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false }) }))
vi.mock("@/components/mqtt/mqttProvider", () => ({ useMqtt: () => ({ connectionState: { isConnected: true } }) }))

const { default: store } = await import("@/store/store")
const { default: TaskInfoPanel } = await import("@/components/rightPanel/taskInfoPanel")
const { TaskCommentFileUpload } = await import("@/components/fileUpload/taskCommentFileUpload")
const { MyTaskTable } = await import("@/components/myTask/myTaskTable")
const { ProjectTaskTable } = await import("@/components/project/projectTaskTable")
const { createListForTaskInfo } = await import("@/store/slice/taskInfoSlice")

// A list answered without its tasks (the server leaves an empty list out):
// the store holds no list at all, and the tables fall back to an empty one.
const listWithoutTasks = () => void store.dispatch(createListForTaskInfo({ tasksInfo: undefined as never }))

afterEach(() => {
  cleanup()
  h.selectors.length = 0
})

/** What each selector `ui` uses gives for the store now, and after a change elsewhere in it. */
function selectionsAcross(ui: ReactElement) {
  h.state = store.getState()
  render(<Provider store={store}>{ui}</Provider>)
  const before = h.state
  store.dispatch({ type: "test/somethingElse" })
  const after = store.getState()
  expect(after).not.toBe(before)
  return h.selectors.map((select) => [select(before), select(after)] as const)
}

describe("task components select what the store holds", () => {
  it.each([
    ["the task panel", () => <TaskInfoPanel taskUUID="no-draft-yet" />, () => {}],
    ["a comment's attachments", () => <TaskCommentFileUpload projectUUID="p" taskUUID="no-draft-yet" />, () => {}],
    ["My Tasks' table", () => <MyTaskTable />, listWithoutTasks],
    ["a project's table", () => <ProjectTaskTable projectId="p" />, listWithoutTasks],
  ])("%s gets the same value back when nothing it reads changed", (_, ui, setup) => {
    setup()
    const pairs = selectionsAcross(ui())
    expect(pairs.length).toBeGreaterThan(0)
    for (const [before, after] of pairs) expect(after).toBe(before)
  })
})
