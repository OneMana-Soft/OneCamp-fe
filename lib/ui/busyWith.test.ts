import { describe, expect, it } from "vitest"

import { busyWith } from "./busyWith"

describe("busyWith: one busy state that several actions share", () => {
  it("is busy with its own action, and waits while another runs", () => {
    expect(busyWith<"setup" | "run">("run", "run")).toEqual({ busy: true, disabled: false })
    expect(busyWith<"setup" | "run">("setup", "run")).toEqual({ busy: false, disabled: true })
  })

  it("tells rows apart by their ids", () => {
    expect(busyWith("row-2", "row-1")).toEqual({ busy: false, disabled: true })
    expect(busyWith("row-1", "row-1")).toEqual({ busy: true, disabled: false })
  })

  it("takes only an action its state can name", () => {
    const running = "run" as "setup" | "run" | null
    // @ts-expect-error "rnu" is no action of this state's: a typo would never be busy.
    expect(busyWith(running, "rnu").busy).toBe(false)
  })

  it("is neither while nothing runs, whether the state says so with null or undefined", () => {
    expect(busyWith<"draft" | "post">(null, "post")).toEqual({ busy: false, disabled: false })
    expect(busyWith<"setup" | "run">(undefined, "run")).toEqual({ busy: false, disabled: false })
  })
})
