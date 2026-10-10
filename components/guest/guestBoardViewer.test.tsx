import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// The shared board's canvas loads in two steps (the live connection, then the
// drawing library), and each showed a spinner in the middle of an empty page.
// It now holds the canvas's place and says what it is doing.
vi.mock("@/hooks/useCollaborationProvider", () => ({ useCollaborationProvider: () => ({ provider: null, synced: false }) }))
vi.mock("@excalidraw/excalidraw/index.css", () => ({}))
vi.mock("next/dynamic", () => ({ default: () => () => null }))

import { GuestBoardViewer } from "./GuestBoardViewer"

describe("a guest's live board before it connects", () => {
  afterEach(() => cleanup())

  it("holds the canvas's place and says so, without a spinner", () => {
    render(<GuestBoardViewer documentName="board:b1" boardId="b1" token="tok" tokenFetcher={async () => "jwt"} />)
    expect(screen.getByRole("status")).toHaveTextContent("Opening the board…")
    expect(document.querySelector(".animate-spin")).toBeNull()
  })
})
