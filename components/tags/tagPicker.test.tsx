import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// Web Q5 (the audit): the label picker read a failed load of the project's
// labels as a project with none, said "No tags in this project yet." and
// offered to create whatever was typed, which made a second "Bug" beside the
// project's "bug".

let answer: { data?: { data: { name: string; count: number }[] }; isError?: unknown } = {}
const mutate = vi.fn()
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ ...answer, isLoading: false, mutate }) }))

const { TagPicker } = await import("@/components/tags/TagPicker")

afterEach(() => {
  cleanup()
  mutate.mockClear()
  answer = {}
})

const openPicker = () => {
  render(<TagPicker projectId="p" label="" canEdit onChange={() => {}} />)
  fireEvent.click(screen.getByRole("button", { name: "Add labels" }))
  mutate.mockClear()
}

describe("the label picker", () => {
  it("offers Try again, not Create, when the project's labels couldn't be read", () => {
    answer = { isError: new Error("Request failed with status code 500") }
    openPicker()
    expect(screen.getByText("Couldn't load this project's labels")).toBeTruthy()
    expect(screen.queryByText("No tags in this project yet.")).toBeNull()
    expect(screen.queryByPlaceholderText("Find or create a label…")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it("keeps the labels it read when a later read fails", () => {
    answer = { data: { data: [{ name: "bug", count: 3 }] }, isError: new Error("Network Error") }
    openPicker()
    expect(screen.getByText("bug")).toBeTruthy()
    expect(screen.queryByText("Couldn't load this project's labels")).toBeNull()
  })
})
