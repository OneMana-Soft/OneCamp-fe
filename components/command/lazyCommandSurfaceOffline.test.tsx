import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"

// A conversation whose command surface can't load (offline, where lib/
// chunkRecovery doesn't reload the page): the composer and the messages carry
// on, and the surface is nothing until its code comes. Every composer draws
// it, so a surface that threw to the page's error boundary took every
// conversation down with it.
vi.mock("@/components/command/CommandSurface", () => {
  throw new Error("Loading chunk CommandSurface failed")
})
// next/dynamic as the app router runs it (React.lazy): vitest would load the
// pages router's, which swallows the failure.
vi.mock("next/dynamic", async () => ({ default: (await import("next/dist/shared/lib/app-dynamic")).default }))
const fetchCommandCatalog = vi.hoisted(() => vi.fn(async () => ({ commands: [] })))
vi.mock("@/services/commandService", () => ({ fetchCommandCatalog }))

const { LazyCommandSurface } = await import("@/components/command/LazyCommandSurface")

describe("a command surface whose code can't load", () => {
  it("leaves the conversation drawn", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    render(
      <section>
        <p>Ship the launch plan today</p>
        <LazyCommandSurface surfaceKey="c1" channelId="c1" />
        <div role="textbox" aria-label="Message #launch" />
      </section>,
    )
    // Settled: the failure said (lib/lazy/lazyPart warns), or the conversation gone with it.
    await waitFor(() => expect(warn.mock.calls.length > 0 || !screen.queryByText("Ship the launch plan today")).toBe(true))
    expect(screen.getByText("Ship the launch plan today")).toBeTruthy()
    expect(screen.getByRole("textbox", { name: "Message #launch" })).toBeTruthy()
    warn.mockRestore()
  })

  // A "/" typed in a conversation's first instant offered formatting alone,
  // since its commands were read only once this code had come (the owner, 23 Oct).
  it("still reads its conversation's commands as the composer draws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    render(<LazyCommandSurface surfaceKey="c2" channelId="c2" />)
    await waitFor(() => expect(fetchCommandCatalog).toHaveBeenCalledWith("c2"))
    warn.mockRestore()
  })
})
