import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select"

// Critic, 11 Oct: a select's value was clamped with line-clamp, which ends a
// text at a line break; on the trigger's one nowrap line there is none, so a
// long value was cut mid-letter with no ellipsis ("Workspace default
// (claude-sonr"). The value truncates instead.
describe("a select's value", () => {
  it("truncates with an ellipsis", () => {
    const { container } = render(
      <Select value="x">
        <SelectTrigger>
          <SelectValue placeholder="Pick" />
        </SelectTrigger>
      </Select>,
    )
    const trigger = container.querySelector("button") as HTMLElement
    const classes = trigger.className.split(/\s+/)
    expect(classes).toContain("[&>span]:truncate")
    expect(classes).toContain("[&>span]:min-w-0")
    expect(classes).not.toContain("[&>span]:line-clamp-1")
  })
})
