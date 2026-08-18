import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/axiosInstance", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import axiosInstance from "@/lib/axiosInstance"
import { getAIMCPServer, setAIMCPServer } from "./aiModelService"

const mockGet = axiosInstance.get as unknown as ReturnType<typeof vi.fn>
const mockPost = axiosInstance.post as unknown as ReturnType<typeof vi.fn>

afterEach(() => {
  vi.clearAllMocks()
})

/**
 * The MCP admission settings gate whether external AI clients can reach this workspace
 * at all. The admin screen showing them has one hard requirement: a toggle displayed as
 * OFF must mean the surface is closed. Anything that could render an unknown state as
 * "on" would tell an admin the door is shut when it is not — so the defaults here are
 * safety behaviour, not convenience.
 */
describe("getAIMCPServer defaults are safe", () => {
  it("returns the server's values when present", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        data: {
          enabled: true,
          tool_groups: "tasks,docs",
          available_groups: ["docs", "messages", "tasks"],
        },
      },
    })

    const got = await getAIMCPServer()

    expect(got.enabled).toBe(true)
    expect(got.tool_groups).toBe("tasks,docs")
    // Order is the server's: it sorts them, and re-sorting here would make the checkbox
    // list reorder between page loads.
    expect(got.available_groups).toEqual(["docs", "messages", "tasks"])
  })

  it("reads a missing or malformed response as OFF with nothing exposed", async () => {
    for (const body of [{}, { data: null }, { data: {} }, { data: { enabled: null } }]) {
      mockGet.mockResolvedValueOnce({ data: body })

      const got = await getAIMCPServer()

      expect(got.enabled).toBe(false)
      expect(got.tool_groups).toBe("")
      expect(got.available_groups).toEqual([])
    }
  })

  it("offers no groups when the server reports none", async () => {
    // An empty list must not become a wildcard. The asymmetry matters: a truncated
    // setting has to close the surface, never open it.
    mockGet.mockResolvedValueOnce({
      data: { data: { enabled: true, tool_groups: "", available_groups: [] } },
    })

    const got = await getAIMCPServer()

    expect(got.tool_groups).toBe("")
    expect(got.available_groups).toEqual([])
  })
})

describe("setAIMCPServer sends one decision", () => {
  it("posts both values together", async () => {
    mockPost.mockResolvedValueOnce({ data: {} })

    await setAIMCPServer(true, "tasks,docs")

    // Both in one request because they are one decision: the flag without groups
    // enables a surface exposing nothing, and groups without the flag look like they
    // took effect when nothing changed.
    expect(mockPost).toHaveBeenCalledTimes(1)
    const [, body] = mockPost.mock.calls[0]
    expect(body).toEqual({ enabled: true, tool_groups: "tasks,docs" })
  })

  it("sends the wildcard verbatim", async () => {
    mockPost.mockResolvedValueOnce({ data: {} })

    await setAIMCPServer(true, "*")

    const [, body] = mockPost.mock.calls[0]
    expect(body).toEqual({ enabled: true, tool_groups: "*" })
  })

  it("can close the surface", async () => {
    mockPost.mockResolvedValueOnce({ data: {} })

    await setAIMCPServer(false, "")

    const [, body] = mockPost.mock.calls[0]
    expect(body).toEqual({ enabled: false, tool_groups: "" })
  })
})
