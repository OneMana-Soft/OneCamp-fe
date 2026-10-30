import { afterEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// design-14, item 2: an AI switch saved as it flips offers the change back in
// its row's words, and Undo saves the old value through the same row.

const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ toast, useToast: () => ({ toast }) }))
vi.mock("@/components/admin/ai/useAIConfig", async () => {
  const { useState } = await import("react")
  type Config = Record<string, unknown> | null
  return {
    useAIConfig: () => {
      const [config, setConfig] = useState<Config>({ coworker_enabled: true })
      return { config, setConfig: (f: (c: Config) => Config) => setConfig(f) }
    },
  }
})

const { ConfigSwitchRow } = await import("./aiSwitch")

afterEach(() => {
  cleanup()
  toast.mockReset()
})

it("offers a switch back in its row's words, and Undo saves the old value", async () => {
  const request = vi.fn(async () => undefined)
  render(<ConfigSwitchRow field="coworker_enabled" request={request} label="AI coworker (@mention)" />)
  const row = () => screen.getByRole("switch", { name: "AI coworker (@mention)" })
  await act(async () => void fireEvent.click(row()))
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "AI coworker (@mention): Off" })))

  const [{ action }] = toast.mock.calls[0] as [{ action: { props: { onClick: () => Promise<void> } } }]
  await act(() => action.props.onClick())
  expect(request.mock.calls).toEqual([[false], [true]])
  expect(row().getAttribute("aria-checked")).toBe("true")
  expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Undone" }))
})
