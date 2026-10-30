import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"

/**
 * L-1: a project's list is in the project's one manual order (task_rank,
 * the board's order too) unless the person picks another: with no sort
 * chosen, the list asks the server for task_rank.
 */

let params = new URLSearchParams()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => params,
  usePathname: () => "/app/project/p",
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false }) }))

const asked: string[] = []
vi.mock("@/hooks/useFetch", () => {
  const nothing = { data: undefined, isLoading: false, isError: undefined, mutate: async () => undefined }
  return {
    useFetch: (url: string) => {
      if (url.startsWith("/project/taskList/")) asked.push(url)
      return nothing
    },
    useFetchOnlyOnce: () => nothing,
    useMediaFetch: () => nothing,
  }
})

const { default: store } = await import("@/store/store")
const { ProjectTaskTable } = await import("@/components/project/projectTaskTable")

afterEach(() => {
  cleanup()
  asked.length = 0
  params = new URLSearchParams()
})

const sortingAsked = () => asked.map((u) => new URL(u, "http://app").searchParams.get("sorting"))

describe("the list's sort", () => {
  it("is Manual when none is chosen: the read asks for the project's order", () => {
    render(
      <Provider store={store}>
        <ProjectTaskTable projectId="p" />
      </Provider>,
    )
    expect(sortingAsked()[0]).toBe(JSON.stringify([{ id: "task_rank", desc: false }]))
  })

  it("is the one chosen otherwise", () => {
    params = new URLSearchParams({ sort: JSON.stringify([{ id: "task_due_date", desc: false }]) })
    render(
      <Provider store={store}>
        <ProjectTaskTable projectId="p" />
      </Provider>,
    )
    expect(sortingAsked()[0]).toBe(JSON.stringify([{ id: "task_due_date", desc: false }]))
  })
})
