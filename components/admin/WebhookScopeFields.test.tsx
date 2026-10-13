import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { scopePayload, scopeProblem, WebhookScopeFields } from "@/components/admin/WebhookScopeFields"

// An outgoing webhook says what it is sent events from (SA-BUG-10): the
// server dropped the scope the create dialog sent, the edit dialog had none,
// and every webhook was the whole workspace's, which was sent every DM's text
// (BE-BUG-13) and no channel's events at all.

const CH = "c0ffee00-0000-4000-8000-000000000001"
const PROJECT = "b0a4d000-0000-4000-8000-000000000001"

describe("a webhook's scope", () => {
  it("is sent as the server reads it", () => {
    expect(scopePayload("org", "left over")).toEqual({ scope_type: "org" })
    expect(scopePayload("channel", ` ${CH} `)).toEqual({ scope_type: "channel", scope_entity_id: CH })
    expect(scopePayload("project", PROJECT)).toEqual({ scope_type: "project", scope_entity_id: PROJECT })
    expect(scopePayload("dm", "x")).toEqual({ scope_type: "org" })
  })

  it("asks for its channel or project before it is sent", () => {
    expect(scopeProblem("org", "")).toBeUndefined()
    expect(scopeProblem("channel", "")).toMatch(/Choose the channel/)
    expect(scopeProblem("channel", CH)).toBeUndefined()
    expect(scopeProblem("project", "website")).toMatch(/project's ID/)
    expect(scopeProblem("project", PROJECT)).toBeUndefined()
  })

  it("says what the whole workspace is sent, private channels and DMs included", () => {
    render(<WebhookScopeFields scope="org" entity="" onChange={() => {}} channels={[]} channelsLoading={false} idPrefix="t" />)
    expect(screen.getByText(/a private channel's events carry only ids/i)).toBeTruthy()
    expect(screen.getByText(/Direct messages are never sent/i)).toBeTruthy()
  })

  it("asks for a project's ID when one project is chosen", () => {
    const onChange = vi.fn()
    render(<WebhookScopeFields scope="project" entity="" onChange={onChange} channels={[]} channelsLoading={false} idPrefix="t" />)
    fireEvent.change(screen.getByLabelText("Project ID"), { target: { value: PROJECT } })
    expect(onChange).toHaveBeenCalledWith("project", PROJECT)
  })
})
