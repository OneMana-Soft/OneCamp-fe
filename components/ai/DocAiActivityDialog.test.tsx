import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const activity = vi.fn()
vi.mock("@/lib/ai/docAIApi", () => ({ getDocAIActivity: (...a: unknown[]) => activity(...a) }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import DocAiActivityDialog, { kindOf, metaOf } from "./DocAiActivityDialog"
import type { DocAIActivityItem } from "@/lib/ai/docAIApi"

// "AI activity on this doc" (ai-search-io P1-2): each AI edit accepted here,
// what agents wrote, tasks made and refusals, as the record keeps them.

beforeEach(() => {
  activity.mockReset()
})
afterEach(cleanup)

const at = "2026-10-13T09:00:00Z"
const rows: DocAIActivityItem[] = [
  { at, action: "ai.doc.agent_edit.allowed", status: "allowed", summary: "Release Captain replaced a section of a doc", actor: "sam@acme.test", actor_kind: "agent", agent_name: "Release Captain", seq: 4812 },
  { at, action: "ai.doc.edit.accepted", summary: "Accepted an AI rewrite (2 of 3 changes), written by qwen3 4B on your server", actor: "maya@acme.test", actor_kind: "human", seq: 4801 },
  { at, action: "ai.doc.tasks.created", summary: "Made 2 tasks in Launch from a doc's action items", actor: "maya@acme.test", actor_kind: "human", seq: 4790 },
  { at, action: "ai.doc.read.refused", status: "refused", summary: "Doc AI refused: you can't open this doc", actor: "lee@acme.test", actor_kind: "human", seq: 4700 },
]

describe("a row of AI activity", () => {
  it("is drawn by what it is about", () => {
    expect(rows.map(kindOf)).toEqual(["agent", "edit", "tasks", "refused"])
  })

  it("names who it was for, and when", () => {
    const now = new Date("2026-10-13T09:02:00Z")
    expect(metaOf(rows[0], now)).toMatchObject({ who: "for sam@acme.test", when: "2m ago" })
    expect(metaOf(rows[1], now).who).toBe("maya@acme.test")
  })
})

describe("the dialog", () => {
  it("lists the record's rows, newest first, with their place in the record", async () => {
    activity.mockResolvedValueOnce(rows)
    render(<DocAiActivityDialog docId="d1" onClose={() => {}} />)
    expect(await screen.findByText("Release Captain replaced a section of a doc")).toBeTruthy()
    expect(screen.getAllByRole("listitem")).toHaveLength(4)
    expect(screen.getByText("Entry 4,812")).toBeTruthy()
    expect(activity).toHaveBeenCalledWith("d1")
    // Where a member checks their own record.
    expect(screen.getByRole("link", { name: "Check your AI record" }).getAttribute("href")).toBe("/app/settings/agents")
  })

  it("says when there is nothing yet", async () => {
    activity.mockResolvedValueOnce([])
    render(<DocAiActivityDialog docId="d1" onClose={() => {}} />)
    expect(await screen.findByText("No AI activity yet")).toBeTruthy()
  })

  it("says it couldn't load, and tries again", async () => {
    activity.mockRejectedValueOnce(new Error("offline"))
    render(<DocAiActivityDialog docId="d1" onClose={() => {}} />)
    const retry = await screen.findByRole("button", { name: /Try again/ })
    activity.mockResolvedValueOnce(rows.slice(0, 1))
    await act(async () => {
      fireEvent.click(retry)
    })
    expect(await screen.findByText("Release Captain replaced a section of a doc")).toBeTruthy()
  })

  it("closes with Done", async () => {
    activity.mockResolvedValueOnce([])
    const onClose = vi.fn()
    render(<DocAiActivityDialog docId="d1" onClose={onClose} />)
    fireEvent.click(await screen.findByRole("button", { name: "Done" }))
    expect(onClose).toHaveBeenCalled()
  })

  it("never claims more than the record shows", async () => {
    activity.mockResolvedValueOnce(rows)
    render(<DocAiActivityDialog docId="d1" onClose={() => {}} />)
    await screen.findByText("Release Captain replaced a section of a doc")
    expect(document.body.textContent).not.toMatch(/complian|certif/i)
  })
})
