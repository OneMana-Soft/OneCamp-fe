import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, waitFor } from "@testing-library/react"
import useSWR, { SWRConfig } from "swr"

import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge"
import type { DocChildren, DocList, TreeNodeJSON } from "@/types/docGraph"

// Docs & Files' calls (docs F1), in the contract's shapes: an upload's form,
// a new version's, a folder's and a link's request, and a colour shown at
// once, sent in writes of at most 200, and read again either way.

const post = vi.fn(async (url: string, body: unknown, config?: unknown): Promise<{ data: { data: unknown } }> => {
  void body
  void config
  if (url === "/doc/createDoc") return { data: { data: { doc_uuid: "made-1", doc_title: "" } } }
  if (url === "/doc/files") return { data: { data: { kind: "doc", uuid: "file-1", title: "brief.pdf", has_children: false, node_kind: "file" } } }
  return { data: { data: {} } }
})
const get = vi.fn(async (url: string) => ({ data: answers[url] }))
let answers: Record<string, unknown> = {}
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: { get: (url: string) => get(url), post: (url: string, body: unknown, config?: unknown) => post(url, body, config) },
}))

import { colorDocs, COLOR_BATCH, nodeRequest, uploadDocFile, uploadDocFileVersion, uploadForm, versionFileKey, versionForm, versionsKey, withColor } from "./docFilesService"

const fields = (form: FormData) => [...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v : (v as File).name])

beforeEach(() => {
  post.mockClear()
  get.mockClear()
  answers = {}
})
afterEach(cleanup)

describe("an upload", () => {
  const file = new File(["%PDF"], "brief.pdf", { type: "application/pdf" })

  it("sends the file and the folder it goes in, or the top of a space, never both", () => {
    expect(fields(uploadForm(file, { parent: "folder-1", after: "page-2" }))).toEqual([
      ["file", "brief.pdf"],
      ["parent_uuid", "folder-1"],
      ["after_uuid", "page-2"],
    ])
    expect(fields(uploadForm(file, { space: "project:p-1" }))).toEqual([
      ["file", "brief.pdf"],
      ["space", "project:p-1"],
    ])
  })

  it("posts multipart to /doc/files and says its own failure", async () => {
    const node = await uploadDocFile(file, { parent: "folder-1" })
    expect(node.node_kind).toBe("file")
    const [url, body, config] = post.mock.calls[0]
    expect(url).toBe("/doc/files")
    expect(body).toBeInstanceOf(FormData)
    expect(config).toMatchObject({ suppressErrorToast: true })
  })

  it("sends a new version's note only when there is one", async () => {
    expect(fields(versionForm(file, "  Signed copy  "))).toEqual([
      ["file", "brief.pdf"],
      ["note", "Signed copy"],
    ])
    expect(fields(versionForm(file, "   "))).toEqual([["file", "brief.pdf"]])
    await uploadDocFileVersion("file-1", file, "Signed copy")
    expect(post.mock.calls[0][0]).toBe("/doc/files/file-1/versions")
  })

  it("reads a version through the doc's file route, by its attachment", () => {
    expect(versionsKey("file-1")).toBe("/doc/files/file-1/versions")
    expect(versionFileKey("file-1", "att-3")).toBe("/doc/getFile/file-1/att-3")
  })
})

describe("a folder and a link", () => {
  it("are made as a page is, with their kind, private unless at the workspace's top", () => {
    expect(nodeRequest("folder", " Contracts ", { space: "project:p-1" })).toEqual({ doc_title: "Contracts", space: "project:p-1", doc_private: true, node_kind: "folder" })
    expect(nodeRequest("folder", "Shared", { space: "workspace" })).toEqual({ doc_title: "Shared", space: "workspace", doc_private: false, node_kind: "folder" })
    expect(nodeRequest("link", "", { parentId: "folder-1", parentPrivate: false }, "https://figma.com/file/x")).toEqual({
      doc_title: "",
      parent_uuid: "folder-1",
      doc_private: false,
      node_kind: "link",
      link_url: "https://figma.com/file/x",
    })
  })
})

describe("a colour", () => {
  it("is a camp hue on a row, or null taking it away", () => {
    const row: TreeNodeJSON = { kind: "doc", uuid: "a", has_children: false, color: "sky" }
    expect(withColor(row, "moss").color).toBe("moss")
    expect("color" in withColor(row, null)).toBe(false)
    expect(withColor(row, "sky")).toBe(row)
  })

  it("shows at once in the cached tree and lists, then sends in writes of at most 200", async () => {
    const level = "/doc/children?space=project%3Ap-1&limit=50"
    const list = "/doc/list?scope=recent"
    answers[level] = { data: { parent: "", nodes: [{ kind: "doc", uuid: "a", title: "A", has_children: false }, { kind: "doc", uuid: "b", title: "B", has_children: false }], hidden: 0, count: 2 } satisfies DocChildren }
    answers[list] = { data: { scope: "recent", docs: [{ doc_uuid: "a", doc_title: "A", path: [] }], count: 1 } satisfies DocList }
    const seen: string[] = []
    function Watch() {
      const tree = useSWR<{ data: DocChildren }>(level, (k: string) => get(k).then((r) => r.data as { data: DocChildren }))
      const docs = useSWR<{ data: DocList }>(list, (k: string) => get(k).then((r) => r.data as { data: DocList }))
      seen.push(`${tree.data?.data.nodes.map((n) => n.color ?? "-").join(",")}|${docs.data?.data.docs.map((d) => d.doc_color ?? "-").join(",")}`)
      return null
    }
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <SWRMutateBridge />
        <Watch />
      </SWRConfig>,
    )
    await waitFor(() => expect(seen.at(-1)).toBe("-,-|-"))
    // The server keeps its old answer until the write lands: the colour on
    // screen comes from the correction, not a read.
    let release!: () => void
    post.mockImplementationOnce(async () => {
      await new Promise<void>((r) => (release = r))
      return { data: { data: { count: 1 } } }
    })
    const done = colorDocs(["a"], "berry")
    await waitFor(() => expect(seen.at(-1)).toBe("berry,-|berry"))
    release()
    await done
    expect(post).toHaveBeenCalledWith("/doc/color", { doc_uuids: ["a"], color: "berry" }, { suppressErrorToast: true })
  })

  it("splits a big selection into writes the server takes", async () => {
    const ids = Array.from({ length: COLOR_BATCH + 5 }, (_, i) => `n-${i}`)
    await colorDocs(ids, null)
    const sent = post.mock.calls.filter(([url]) => url === "/doc/color").map(([, body]) => (body as { doc_uuids: string[] }).doc_uuids.length)
    expect(sent).toEqual([COLOR_BATCH, 5])
  })
})

void React
