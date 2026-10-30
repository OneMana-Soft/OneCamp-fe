import { describe, expect, it } from "vitest"
import { NO_ACCESS } from "@/lib/work/access"
import { mayMoveInto } from "@/lib/board/moveInto"
import type { WorkAccess } from "@/lib/work/types"

const member: WorkAccess = { ...NO_ACCESS, role: "member", view: true, comment: true, create_tasks: true, edit_tasks: "all" }
describe("whether the project's rules let someone move tasks into a status", () => {
  // The board's read says it per ruled status (project_access.move_into): a
  // custom status's own rule first, then its category's, as the server's gate.
  const ruled: WorkAccess = { ...member, move_into: { done: false, "c-shipped": true, inReview: false } }
  const status = (value: string, category: string) => ({ value, category })

  it("is the status's own rule, then its category's", () => {
    expect(mayMoveInto(ruled, status("done", "done"))).toBe(false)
    expect(mayMoveInto(ruled, status("c-shipped", "done"))).toBe(true)
    expect(mayMoveInto(ruled, status("c-polish", "inReview"))).toBe(false)
  })

  it("is yes where no rule says who, and where the read said nothing", () => {
    expect(mayMoveInto(ruled, status("todo", "todo"))).toBe(true)
    expect(mayMoveInto(ruled, status("c-later", "backlog"))).toBe(true)
    expect(mayMoveInto(member, status("done", "done"))).toBe(true)
  })
})
