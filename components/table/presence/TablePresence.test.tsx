import { afterEach, describe, expect, it, vi } from "vitest"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import * as React from "react"

const { post, heard } = vi.hoisted(() => ({ post: vi.fn(), heard: { current: undefined as ((m: string) => void) | undefined } }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...a: unknown[]) => post(...a) } }))
vi.mock("@/hooks/useMqttTopic", () => ({ useMqttTopic: ({ onMessage }: { onMessage: (m: string) => void }) => void (heard.current = onMessage) }))
vi.mock("@/hooks/useMyId", () => ({ useMyId: () => "me" }))
// The faces' tooltips read the screen's size, which the app provides.
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isTablet: false, isDesktop: true }) }))

import TablePresence, { focusedCell } from "@/components/table/presence/TablePresence"
import { TooltipProvider } from "@/components/ui/tooltip"

const row = "6f1d2c3b-4a59-4e6f-8a7b-9c0d1e2f3a4b"
const field = "11111111-2222-4333-8444-555555555555"

afterEach(() => {
  cleanup()
  post.mockReset()
})

// Who else is on a table, and where (tables A7).
describe("presence on a table", () => {
  it("reads the focused cell's row and field, and whether it's being typed in", () => {
    const { container } = render(
      <table>
        <tbody>
          <tr data-row={row}>
            <td data-field={field}>
              <input aria-label="cell" />
              <input type="checkbox" aria-label="tick" />
            </td>
          </tr>
        </tbody>
      </table>,
    )
    const [text, box] = Array.from(container.querySelectorAll("input"))
    expect(focusedCell(text)).toEqual({ row_id: row, field_id: field, editing: true })
    expect(focusedCell(box)).toEqual({ row_id: row, field_id: field, editing: undefined })
    expect(focusedCell(document.body)).toEqual({})
  })

  it("says it's here when the table opens, shows the others, and says it left when it closes", async () => {
    post.mockResolvedValue({ data: { data: [{ user: "me", at: 1 }, { user: "u2", name: "Maya Chen", row, field, editing: true, at: 1 }] } })
    // The faces' tooltips, as the app provides them.
    const { container, unmount } = render(
      <TooltipProvider>
        <TablePresence tableId="t1" topic="here/t1" />
      </TooltipProvider>,
    )
    await waitFor(() => expect(container.querySelector("[data-participant]")).not.toBeNull())
    expect(post.mock.calls[0]).toEqual(["/tables/t1/presence", {}, OWN_ERRORS])
    // Maya alone is drawn (not me), and her cell is marked.
    expect(container.querySelectorAll("[data-participant]")).toHaveLength(1)
    expect(container.querySelector("style")?.textContent).toContain('content:"Maya"')
    // Someone moves: heard on the presence topic.
    act(() => heard.current?.(JSON.stringify({ data: { action: "presence", people: [{ user: "me", at: 2 }] } })))
    await waitFor(() => expect(container.querySelector("[data-table-presence]")).toBeNull())
    unmount()
    expect(post).toHaveBeenLastCalledWith("/tables/t1/presence", { gone: true }, OWN_ERRORS)
  })

  // As Sheets does: a face is a way to the cell its person is on.
  it("goes to a person's cell when their face is clicked, and leaves a face with no cell a face", async () => {
    post.mockResolvedValue({ data: { data: [{ user: "u2", name: "Maya Chen", row, field, editing: true, at: 1 }, { user: "u3", name: "Priya Nair", at: 1 }] } })
    const onGoTo = vi.fn()
    const { container } = render(
      <TooltipProvider>
        <TablePresence tableId="t1" topic="here/t1" onGoTo={onGoTo} />
      </TooltipProvider>,
    )
    await waitFor(() => expect(container.querySelectorAll("[data-participant]")).toHaveLength(2))
    const maya = container.querySelector<HTMLButtonElement>('button[data-participant][aria-label="Go to Maya Chen\'s cell"]')
    expect(maya).not.toBeNull()
    act(() => maya?.click())
    expect(onGoTo).toHaveBeenCalledWith(row, field)
    // Priya is on the table but on no cell: her face is no button.
    expect(container.querySelectorAll("button[data-participant]")).toHaveLength(1)
  })
})
