import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

/**
 * PTC-1: a project the reader isn't in, or one that isn't there, drew the
 * whole project page (an empty title, tabs, a live New task, Filter and
 * Cycles) over "Couldn't load this project's tasks ... a connection
 * problem". The project's own read now decides the page.
 */
const h = vi.hoisted(() => ({ info: undefined as unknown, mutate: vi.fn() }))

vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => (key.startsWith("/project/info/") ? { mutate: h.mutate, ...(h.info as object) } : { data: undefined, isLoading: true }),
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }))
vi.mock("@/components/project/projectTaskDesktop", () => ({ ProjectTaskDesktop: () => <div data-testid="project-page">New task</div> }))
vi.mock("@/components/project/projectListTabs", () => ({ ProjectListTabs: () => <div data-testid="project-page-phone" /> }))

const { ProjectView } = await import("./ProjectView")

afterEach(() => {
  cleanup()
  h.info = undefined
  h.mutate.mockClear()
})

const id = "0c3b5f86-5911-49c9-9f0c-24a47241a6bd"
const failed = (status?: number) => ({ data: undefined, isLoading: false, isError: status ? { response: { status } } : new Error("Network Error") })

describe("a project's page when its project can't be read", () => {
  it("says a project the reader isn't in is not theirs, with the way back and nothing of the project", () => {
    h.info = failed(403)
    render(<ProjectView projectId={id} />)
    expect(screen.getByRole("heading", { name: "You can't see this project" })).toBeTruthy()
    expect(screen.getByText(/Ask one of its admins to add you/)).toBeTruthy()
    expect(screen.getByRole("link", { name: "Back to projects" }).getAttribute("href")).toBe("/app/project")
    expect(screen.queryByTestId("project-page")).toBeNull()
    expect(screen.queryByText("New task")).toBeNull()
  })

  it.each([404, 400])("says a project that isn't there (%i) is gone", (status) => {
    h.info = failed(status)
    render(<ProjectView projectId={id} />)
    expect(screen.getByRole("heading", { name: "This project doesn't exist or was deleted" })).toBeTruthy()
    expect(screen.queryByTestId("project-page")).toBeNull()
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull()
  })

  it("says a read that failed couldn't load, and Try again reads it again", () => {
    h.info = failed(503)
    render(<ProjectView projectId={id} />)
    expect(screen.getByText("Couldn't load this project")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /try again/i }))
    expect(h.mutate).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId("project-page")).toBeNull()
  })

  it("draws the project while it loads, and once it has, even if a refresh then fails", () => {
    h.info = { data: undefined, isLoading: true }
    const { unmount } = render(<ProjectView projectId={id} />)
    expect(screen.getByTestId("project-page")).toBeTruthy()
    unmount()
    h.info = { data: { data: { project_uuid: id, project_name: "Q4 launch" } }, isLoading: false, isError: { response: { status: 503 } } }
    render(<ProjectView projectId={id} />)
    expect(screen.getByTestId("project-page")).toBeTruthy()
  })
})
