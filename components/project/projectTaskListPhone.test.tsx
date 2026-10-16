import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { Provider } from "react-redux"

// A project's task list on a phone: its search, and Select beside it. They
// took two rows, about 170 px above the first task (PTC-43).

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/app/project/p",
}))
const asked: string[] = []
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    if (url) asked.push(url)
    return { data: { data: { project_is_admin: true, project_tasks: [] }, pageCount: 0 }, isLoading: false, isError: false, mutate: vi.fn() }
  },
  useFetchOnlyOnce: () => ({ data: undefined }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(async () => ({})), isSubmitting: false }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))

const { default: store } = await import("@/store/store")
const { ProjectTaskList } = await import("@/components/project/projectTaskList")

afterEach(cleanup)

describe("a project's task list on a phone (PTC-43)", () => {
  it("puts Select beside the search, and Select all under them only while selecting", () => {
    render(
      <Provider store={store}>
        <ProjectTaskList projectId="p" searchQuery="" search={<input aria-label="Search tasks" />} />
      </Provider>,
    )
    const row = screen.getByRole("textbox", { name: "Search tasks" }).closest("[data-list-search-row]") as HTMLElement
    expect(row).not.toBeNull()
    expect(within(row).getByRole("button", { name: /Select/ })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Select all/ })).toBeNull()

    fireEvent.click(within(row).getByRole("button", { name: /Select/ }))
    expect(within(row).getByRole("button", { name: /Done/ })).toBeTruthy()
    const selectAll = screen.getByRole("button", { name: /Select all|Clear selection/ })
    expect(row.contains(selectAll)).toBe(false)
  })
})

describe("a project's task list on a phone (PROJ-BUG-2)", () => {
  it("asks for fifty tasks a page, so most projects' group counts are exact at once", () => {
    asked.length = 0
    render(
      <Provider store={store}>
        <ProjectTaskList projectId="p" searchQuery="" search={null} />
      </Provider>,
    )
    // It asked for 10: a project of 17 tasks read "1+", "2+" and "5+" until a scroll.
    expect(asked.some((u) => /[?&]pageSize=50(&|$)/.test(u))).toBe(true)
    expect(asked.some((u) => /[?&]pageSize=10(&|$)/.test(u))).toBe(false)
  })
})
