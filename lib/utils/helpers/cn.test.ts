import { describe, expect, it } from "vitest"

import { cn } from "@/lib/utils/helpers/cn"

// The calendar's fix (content v3) and the hub's (type roles, shadow steps,
// font-book) met in one twMerge config; both waves' cases stay here.
describe("cn", () => {
  it("keeps the app's type sizes beside a text colour", () => {
    expect(cn("text-micro font-medium", "text-ink-3")).toBe("text-micro font-medium text-ink-3")
    expect(cn("text-ui-sm", "text-brand-text")).toBe("text-ui-sm text-brand-text")
    expect(cn("text-title-3 text-ink")).toBe("text-title-3 text-ink")
  })

  it("still lets a later size win over an earlier one", () => {
    expect(cn("text-meta", "text-ui")).toBe("text-ui")
    expect(cn("text-sm", "text-micro")).toBe("text-micro")
  })
})

describe("cn knows design v3's scales", () => {
  it("keeps a type role beside a text colour", () => {
    // Home's greeting rendered at 14px: the role was read as a colour and dropped.
    expect(cn("text-display", "mt-1 text-foreground")).toBe("text-display mt-1 text-foreground")
    expect(cn("text-meta text-ink-3")).toBe("text-meta text-ink-3")
    expect(cn("text-ui", "text-ink-2")).toBe("text-ui text-ink-2")
  })

  it("still lets a later size win over an earlier one", () => {
    expect(cn("text-sm", "text-ui-sm")).toBe("text-ui-sm")
    expect(cn("text-title-1", "text-display")).toBe("text-display")
  })

  it("treats the elevation ladder and the 450 weight as what they are", () => {
    expect(cn("shadow-e1", "shadow-e2")).toBe("shadow-e2")
    expect(cn("shadow-e1", "shadow-none")).toBe("shadow-none")
    expect(cn("font-medium", "font-book")).toBe("font-book")
  })
})

// Chat's case (8c731b44): the day pill drew at 14px instead of 12px.
describe("cn keeps every type role beside a colour", () => {
  it("keeps a type role beside a text colour", () => {
    for (const role of ["text-meta", "text-ui-sm", "text-ui", "text-body", "text-heading", "text-micro", "text-3xs", "text-title-3"]) {
      expect(cn(role, "text-ink-3")).toBe(`${role} text-ink-3`)
    }
  })
  it("still lets a later size win over an earlier one", () => {
    expect(cn("text-meta", "text-ui")).toBe("text-ui")
    expect(cn("text-sm", "text-meta")).toBe("text-meta")
  })
  it("treats the motion curves as one group", () => {
    expect(cn("ease-out", "ease-spring")).toBe("ease-spring")
    expect(cn("ease-standard", "duration-150")).toBe("ease-standard duration-150")
  })
})
