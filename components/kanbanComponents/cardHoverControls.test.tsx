import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useEffect, type ComponentProps } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { installPointerEvent } from "@/lib/testing/pointerEvent"

import type { StatusOption } from "@/lib/taskStatus"
import type { TaskInfoInterface } from "@/types/task"

// F-1 #2 (FLUIDITY-LEAD, 20 Oct, beta 482460c3d): every card on a board
// mounted its own menu (MenuProvider ×120 on a board of 120 cards), though a
// card's menu shows only on hover. A card's menu is there only while the card
// is pointed at or focused, or the menu is open. Each mounted menu is counted.

const live = vi.hoisted(() => ({ menus: 0 }))
vi.mock("@/components/ui/dropdown-menu", async (orig) => {
  const real = await orig<typeof import("@/components/ui/dropdown-menu")>()
  return {
    ...real,
    DropdownMenu: (props: ComponentProps<typeof real.DropdownMenu>) => {
      useEffect(() => {
        live.menus++
        return () => {
          live.menus--
        }
      }, [])
      return <real.DropdownMenu {...props} />
    },
  }
})
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn(), useSelector: () => undefined }))
vi.mock("@/components/task/taskAssigneeCell", () => ({ TaskAssigneeCell: () => null }))
vi.mock("@/components/task/PRStatusBadge", () => ({ GitHubBadgeGroup: () => null }))

const { TaskBoard } = await import("@/components/kanbanComponents/TaskBoard")

// jsdom has no PointerEvent: a press carries its button only with the stand-in.
installPointerEvent()

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const col = (value: string): StatusOption => ({ value, label: value, category: "todo", custom: false, color: "" })
const VISIBLE = ["todo", "inProgress"].map(col)
const task = (i: number, status: string) =>
  ({ task_uuid: `${status}-${i}`, task_name: `Task ${i}`, task_status: status, task_due_date: "", task_project: { project_uuid: "p", project_name: "P" } }) as unknown as TaskInfoInterface
const COLUMNS = { todo: Array.from({ length: 20 }, (_, i) => task(i, "todo")), inProgress: Array.from({ length: 20 }, (_, i) => task(i, "inProgress")) }

describe("a card's menu", () => {
  it("is mounted only when asked for, never by a pointer passing over the cards", async () => {
    const { container } = render(<TaskBoard columns={COLUMNS} visible={VISIBLE} canDrag={() => true} onMove={() => {}} boardKey="hover" />)
    const cards = [...container.querySelectorAll<HTMLElement>("[data-task-id]")]
    expect(cards).toHaveLength(40)
    expect(live.menus).toBe(0)
    for (const card of cards) {
      fireEvent.pointerEnter(card)
      fireEvent.pointerLeave(card)
    }
    expect(live.menus).toBe(0)
    // Asked for: it opens on the card, and goes again when it closes.
    const button = cards[3].querySelector<HTMLElement>('[aria-label="Card actions"]')!
    fireEvent.pointerDown(button, { button: 0, pointerType: "mouse" })
    fireEvent.click(button)
    expect(live.menus).toBe(1)
    expect(await screen.findByRole("menu")).toBeTruthy()
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })
    await waitFor(() => expect(live.menus).toBe(0))
    // Focus goes back to the button it opened from.
    await waitFor(() => expect(document.activeElement).toBe(cards[3].querySelector('[aria-label="Card actions"]')))
  })
})
