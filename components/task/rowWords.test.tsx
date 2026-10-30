import { act, cleanup, render } from "@testing-library/react"
import { getI18n } from "react-i18next"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/celebrate", () => ({ celebrateTask: () => 8, prefersReducedMotion: () => false }))

import "@/lib/utils/i18n"
import { TaskCheck } from "@/components/task/TaskCheck"
import { TaskPriorityCell } from "@/components/task/taskPriorityCell"
import { statusOptionOf } from "@/lib/taskStatus"
import type { TaskInfoInterface } from "@/types/task"

// fluid-17 (FLUIDITY-LEAD's named run, 20 Oct, a phone at 4x): the check and
// the priority were the two dearest leaves of a row (TaskCheck 237 ms,
// TaskPriorityCell 140 ms over about 380 rows), and each ran useTranslation,
// which made its own t and its own copy of the i18n instance on every mount.
// Their words come from the one instance now, and still follow the language.

const status = statusOptionOf({ task_status: "todo" } as TaskInfoInterface)!
const rows = (n: number) =>
  render(
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i}>
          <TaskCheck done={false} status={status} taskName={`Task ${i}`} onToggle={() => {}} size={20} hit={44} />
          <TaskPriorityCell priority="medium" label="tip" size={14} />
        </div>
      ))}
    </>,
  )

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await act(() => getI18n().changeLanguage("en"))
})

describe("a row's words", () => {
  it("come from the one i18n: no row makes its own t", () => {
    const fixedT = vi.spyOn(getI18n(), "getFixedT")
    const { container } = rows(40)
    expect(fixedT).not.toHaveBeenCalled()
    expect(container.querySelector("[data-priority-level]")!.getAttribute("data-tip")).toBe("Medium")
    expect(container.querySelector("[data-task-check]")!.getAttribute("data-tip")).toBe("To do · click to complete")
  })

  it("follow a switch of language", async () => {
    const i18n = getI18n()
    i18n.addResourceBundle("de", "translation", { medium: "Mittel", todo: "Zu erledigen" }, true, true)
    const { container } = rows(2)
    await act(() => i18n.changeLanguage("de"))
    expect(container.querySelector("[data-priority-level]")!.getAttribute("data-tip")).toBe("Mittel")
    expect(container.querySelector("[data-task-check]")!.getAttribute("data-tip")).toBe("Zu erledigen · click to complete")
  })
})
