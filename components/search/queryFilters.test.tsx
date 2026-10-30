import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// The search page's filters write text, and only text (docs C2-1): each
// modifier in the field is a chip with its ×, From, In and Date write the
// token the server reads, and a date replaces the one there.

const makeRequest = vi.fn()
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))
vi.mock("@/hooks/useDebounce", () => ({ useDebounce: <T,>(v: T) => v }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) =>
    url === "/user/userProjectList"
      ? { data: { data: { user_projects: [{ project_uuid: "p1", project_name: "Q4 launch" }] } } }
      : url === "/team/teamListByUserUID"
        ? { data: { data: [{ team_uuid: "t1", team_name: "Ops" }] } }
        : { data: undefined },
}))

const { QueryFilters } = await import("@/components/search/queryFilters")

afterEach(() => {
  cleanup()
  makeRequest.mockReset()
})

function renderWith(text: string) {
  const onChange = vi.fn()
  render(<QueryFilters text={text} onChange={onChange} />)
  return onChange
}

describe("the search page's filters", () => {
  it("shows each modifier as a chip, and its × takes it out of the text", () => {
    const onChange = renderWith("launch from:@sam -in:#secret")
    const chips = [...document.querySelectorAll("[data-chip]")].map((c) => c.textContent)
    expect(chips).toEqual(["From @sam", "Not in #secret"])
    fireEvent.click(screen.getByRole("button", { name: "Remove Not in #secret" }))
    expect(onChange).toHaveBeenCalledWith("launch from:@sam")
    // A filter that's there isn't offered again.
    expect(document.querySelector('[data-query-filter="from"]')).toBeNull()
    expect(document.querySelector('[data-query-filter="in"]')).toBeNull()
    expect(document.querySelector('[data-query-filter="date"]')).toBeTruthy()
  })

  it("writes a date, in place of the one there", () => {
    const onChange = renderWith("launch")
    fireEvent.click(document.querySelector('[data-query-filter="date"]')!)
    fireEvent.click(screen.getByRole("option", { name: "Past 7 days" }))
    expect(onChange).toHaveBeenCalledWith("launch during:past_7_days")
  })

  it("finds people as they may be seen and writes their handle, or me", async () => {
    makeRequest.mockResolvedValue([
      { type: "user", user_uuid: "u1", user_name: "Sam Rivera", user_handle: "sam" },
      { type: "user", user_uuid: "u2", user_name: "No Handle" },
      { type: "channel", channel_uuid: "c1", channel_name: "launch" },
    ])
    const onChange = renderWith("launch")
    fireEvent.click(document.querySelector('[data-query-filter="from"]')!)
    fireEvent.click(screen.getByRole("option", { name: "Me" }))
    expect(onChange).toHaveBeenLastCalledWith("launch from:me")

    fireEvent.click(document.querySelector('[data-query-filter="from"]')!)
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("Search people…"), { target: { value: "sam" } })
    })
    expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ payload: { search_text: "sam" } }))
    // People only, and only those with a handle to write.
    expect(screen.queryByRole("option", { name: /launch/ })).toBeNull()
    expect(screen.queryByRole("option", { name: /No Handle/ })).toBeNull()
    fireEvent.click(screen.getByRole("option", { name: /Sam Rivera/ }))
    expect(onChange).toHaveBeenLastCalledWith("launch from:@sam")
  })

  it("writes a channel, a DM, a project or a team for In", async () => {
    makeRequest.mockResolvedValue([
      { type: "user", user_uuid: "u1", user_name: "Sam Rivera", user_handle: "sam" },
      { type: "channel", channel_uuid: "c1", channel_name: "launch" },
    ])
    const onChange = renderWith("budget")
    fireEvent.click(document.querySelector('[data-query-filter="in"]')!)
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("Search channels, people, projects…"), { target: { value: "l" } })
    })
    fireEvent.click(screen.getByRole("option", { name: "#launch" }))
    expect(onChange).toHaveBeenLastCalledWith("budget in:#launch")

    fireEvent.click(document.querySelector('[data-query-filter="in"]')!)
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText("Search channels, people, projects…"), { target: { value: "launch" } })
    })
    fireEvent.click(screen.getByRole("option", { name: "Q4 launch" }))
    expect(onChange).toHaveBeenLastCalledWith(`budget in:"Q4 launch"`)
  })

  it("offers no In inside one conversation", () => {
    render(<QueryFilters text="launch" onChange={vi.fn()} inConversation />)
    expect(document.querySelector('[data-query-filter="in"]')).toBeNull()
  })
})
