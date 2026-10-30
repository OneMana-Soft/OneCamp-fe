import { describe, expect, it, vi } from "vitest"

const post = vi.fn(async () => ({ data: { data: {} } }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...a: unknown[]) => post(...(a as [])), get: vi.fn(), delete: vi.fn() } }))

import { childrenKey, docTreeAdapter, listKey } from "@/services/docGraphService"

describe("the docs tree adapter", () => {
  const adapter = docTreeAdapter("private")

  it("names a level by its parent, or by its space at the top", () => {
    expect(childrenKey("p1", { limit: 8 })).toBe("/doc/children?parent=p1&limit=8")
    expect(adapter.key(null, 8)).toBe("/doc/children?space=private&limit=8")
    expect(adapter.isKey("/doc/children?parent=p1&limit=500", "p1")).toBe(true)
    expect(adapter.isKey("/doc/children?space=private&limit=8", null)).toBe(true)
    expect(adapter.isKey("/doc/children?space=workspace&limit=8", null)).toBe(false)
    expect(adapter.isKey("/doc/children?parent=p2&limit=8")).toBe(true)
    expect(adapter.isKey(listKey("mine"))).toBe(false)
  })

  it("never turns a page the viewer can't open into a row", () => {
    const level = adapter.read({
      data: {
        parent: "",
        nodes: [
          { kind: "doc", uuid: "a", title: "A", has_children: true, can_edit: true },
          { kind: "doc", redacted: true, has_children: false },
        ],
        hidden: 2,
        count: 1,
      },
    })
    expect(level.nodes.map((n) => n.title)).toEqual(["A"])
    expect(level.hidden).toBe(2)
  })

  it("carries a node's kind, colour, link and file facts, and makes a file or a link a leaf (docs F1, D-30)", () => {
    const file = { name: "brief.pdf", size_bytes: 2048, mime: "application/pdf", versions: 2, attachment_id: "att-2" }
    const level = adapter.read({
      data: {
        parent: "",
        nodes: [
          { kind: "doc", uuid: "page", title: "Plan", has_children: false },
          { kind: "doc", uuid: "folder", title: "Contracts", has_children: true, node_kind: "folder", color: "moss" },
          { kind: "doc", uuid: "file", title: "brief.pdf", has_children: false, node_kind: "file", file },
          { kind: "doc", uuid: "link", title: "Roadmap", has_children: false, node_kind: "link", link_url: "https://figma.com/file/1" },
        ],
        hidden: 0,
        count: 4,
      },
    })
    expect(level.nodes.map((n) => [n.id, !!n.leaf])).toEqual([
      ["page", false],
      ["folder", false],
      ["file", true],
      ["link", true],
    ])
    expect(level.nodes[1].node.color).toBe("moss")
    expect(level.nodes[2].node.file).toEqual(file)
    expect(level.nodes[3].node.link_url).toBe("https://figma.com/file/1")
  })

  it("sends a move as the server reads it", async () => {
    await adapter.move({ id: "a", to: "b", after: null, place: "last" })
    expect(post).toHaveBeenLastCalledWith("/doc/move", { doc_uuid: "a", parent_uuid: "b", place: "last", access: "keep" })
    await adapter.move({ id: "a", to: null, after: "c" })
    expect(post).toHaveBeenLastCalledWith("/doc/move", { doc_uuid: "a", space: "private", after_uuid: "c", access: "keep" })
  })
})
