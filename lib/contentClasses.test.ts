import { describe, expect, it } from "vitest"
import { contentClasses } from "./contentClasses"

describe("contentClasses", () => {
  it("keeps the classes the editor writes", () => {
    for (const cls of [
      "text-node",
      "heading-node",
      "block-node",
      "list-node",
      "inline",
      "link",
      "mention hover:cursor-pointer",
      "channel-mention hover:cursor-pointer",
      "entity-mention hover:cursor-pointer",
      "task-list",
      "task-item",
      "language-go",
      "language-c++",
      "language-objective-c",
    ]) expect(contentClasses(cls), cls).toBe(cls)
  })

  it("drops every other class, keeping the editor's among them", () => {
    expect(contentClasses("fixed inset-0 z-50 bg-background")).toBe("")
    expect(contentClasses("text-node fixed inset-0 z-[9999]")).toBe("text-node")
    expect(contentClasses("  link   absolute top-0  ")).toBe("link")
    expect(contentClasses("language-")).toBe("")
    expect(contentClasses("language-x w-screen")).toBe("language-x")
  })

  it("is empty for no class at all", () => {
    expect(contentClasses("")).toBe("")
    expect(contentClasses(null)).toBe("")
    expect(contentClasses(undefined)).toBe("")
    expect(contentClasses(42)).toBe("")
  })
})
