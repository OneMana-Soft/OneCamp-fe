import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// The settings Workflows page: its h1 holds the one action, and the card under
// it draws no title of its own. While permissions load, the page draws the
// rows the list will draw, so nothing jumps when the list arrives.

const { caps, cardProps } = vi.hoisted(() => ({ caps: { isLoading: false, granted: true }, cardProps: { last: null as null | Record<string, unknown> } }))
vi.mock("@/hooks/useCapabilities", () => ({ useCapabilities: () => ({ can: () => caps.granted, isLoading: caps.isLoading }) }))
vi.mock("@/components/admin/WorkflowsCard", () => ({
  default: (props: Record<string, unknown>) => {
    cardProps.last = props
    return <div data-testid="workflows-card" />
  },
}))

import WorkflowsSettingsPage from "./page"

beforeEach(() => {
  caps.isLoading = false
  caps.granted = true
  cardProps.last = null
})
afterEach(cleanup)

describe("the settings Workflows page", () => {
  it("puts New workflow in the page's header, and the card draws no title of its own", () => {
    render(<WorkflowsSettingsPage />)
    const button = screen.getByRole("button", { name: "New workflow" })
    expect(cardProps.last?.withTitle).toBe(false)
    expect(cardProps.last?.creating).toBe(false)
    fireEvent.click(button)
    expect(cardProps.last?.creating).toBe(true)
  })

  it("says what workflows do under the title", () => {
    render(<WorkflowsSettingsPage />)
    expect(screen.getByText(/replies or turns it into a task/)).toBeTruthy()
  })

  it("draws the list's own rows while permissions load", () => {
    caps.isLoading = true
    render(<WorkflowsSettingsPage />)
    const status = screen.getByRole("status", { name: "Loading workflows" })
    expect(status.querySelectorAll("[data-workflow-skeleton-row]").length).toBe(3)
    expect(screen.queryByRole("button", { name: "New workflow" })).toBeNull()
  })

  it("offers no New workflow to a member who can't make them", () => {
    caps.granted = false
    render(<WorkflowsSettingsPage />)
    expect(screen.queryByRole("button", { name: "New workflow" })).toBeNull()
    expect(screen.getByText(/Admin, Permissions/)).toBeTruthy()
  })
})
