import * as React from "react"
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

// The recorder itself loads on demand; here it is a stand-in that says whether it is drawn and open.
vi.mock("next/dynamic", () => ({
  default: () =>
    function Recorder({ open }: { open: boolean }) {
      return <div data-testid="clip-recorder" data-open={String(open)} />
    },
}))

import { ClipRecorderHost } from "./composerTools"

// The phone composer's "Record a clip" (V-530 (4), CR-B8 M1): nothing is loaded until the first open, and once
// opened the recorder stays drawn, closed, so a second open doesn't load or mount it again (hooks/useLatch).
describe("ClipRecorderHost", () => {
  const props = { onOpenChange: () => {}, onRecorded: () => {} }

  it("draws nothing until the first open, then keeps the recorder drawn once it closes", () => {
    const { rerender } = render(<ClipRecorderHost open={false} {...props} />)
    expect(screen.queryByTestId("clip-recorder")).toBeNull()
    rerender(<ClipRecorderHost open {...props} />)
    expect(screen.getByTestId("clip-recorder").dataset.open).toBe("true")
    rerender(<ClipRecorderHost open={false} {...props} />)
    expect(screen.getByTestId("clip-recorder").dataset.open).toBe("false")
  })
})
