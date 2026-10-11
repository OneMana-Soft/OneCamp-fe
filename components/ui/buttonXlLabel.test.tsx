import { describe, expect, it } from "vitest"
import { buttonVariants } from "@/components/ui/button"

// The xl primary (sign-in, first run, 404) lost its white label: its size
// class was text-body, which tailwind-merge reads as a text colour and so
// dropped the variant's text-brand-foreground for it.
describe("the xl button", () => {
  it("keeps the primary's label colour", () => {
    const cls = buttonVariants({ variant: "default", size: "xl" })
    expect(cls).toContain("text-brand-foreground")
    expect(cls).toContain("[font-size:var(--text-body)]")
  })
})
