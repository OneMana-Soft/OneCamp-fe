// First: React DOM looks for the DevTools hook as it loads.
import { renders } from "@/lib/testing/reactRenders"

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

// The avatar is plain DOM (FLUIDITY-25): its image is drawn hidden from the
// first paint, and its load shows it and hides the fallback with no render.
// jsdom loads no image, so a test fires the load and error itself.
function Face({ src, alt = "" }: { src?: string; alt?: string }) {
  return (
    <Avatar role="img" aria-label="Ada Lovelace" data-testid="face">
      {src ? <AvatarImage src={src} alt={alt} /> : null}
      <AvatarFallback>AL</AvatarFallback>
    </Avatar>
  )
}

const face = () => screen.getByTestId("face")
const image = () => face().querySelector("img")
const loaded = () => face().hasAttribute("data-avatar-loaded")

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("an avatar", () => {
  it("shows its initials while the image loads, and the image, not the initials, once it has", () => {
    render(<Face src="/ada.png" />)
    expect(image()?.hidden, "the image is hidden while it loads").toBe(true)
    expect(loaded()).toBe(false)
    expect(screen.getByText("AL")).toBeTruthy()
    renders.reset()
    fireEvent.load(image()!)
    expect(image()?.hidden, "the loaded image shows").toBe(false)
    expect(loaded(), "the fallback's CSS hides it under a loaded avatar").toBe(true)
    expect(renders.count, "a load draws nothing").toBe(0)
  })

  it("keeps its initials when the image fails, and has no image at all with no address", () => {
    render(<Face src="/gone.png" />)
    fireEvent.error(image()!)
    expect(image()?.hidden).toBe(true)
    expect(loaded()).toBe(false)
    cleanup()
    render(<Face />)
    expect(image()).toBeNull()
    expect(loaded()).toBe(false)
    expect(screen.getByText("AL")).toBeTruthy()
  })

  it("shows an image already in the cache from its first paint, with no flash of initials", () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true)
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(64)
    render(<Face src="/cached.png" />)
    expect(image()?.hidden).toBe(false)
    expect(loaded()).toBe(true)
  })

  it("hides the image again for a new address until that one loads, and shows the initials when the image leaves", () => {
    const { rerender } = render(<Face src="/one.png" />)
    fireEvent.load(image()!)
    rerender(<Face src="/two.png" />)
    expect(image()?.hidden, "the new address loads hidden").toBe(true)
    expect(loaded()).toBe(false)
    fireEvent.load(image()!)
    expect(loaded()).toBe(true)
    rerender(<Face />)
    expect(image()).toBeNull()
    expect(loaded(), "the image gone, its initials show again").toBe(false)
  })

  it("keeps the avatar's role and name, and the image's alt", () => {
    render(<Face src="/ada.png" alt="Ada" />)
    expect(screen.getByRole("img", { name: "Ada Lovelace" })).toBe(face())
    expect(image()?.getAttribute("alt")).toBe("Ada")
    // A hidden image is out of the accessibility tree until it loads, as Radix drew none.
    expect(screen.queryByRole("img", { name: "Ada" })).toBeNull()
    fireEvent.load(image()!)
    expect(screen.getByRole("img", { name: "Ada" })).toBe(image())
  })

  it("keeps the classes its callers give each part, after its own", () => {
    render(
      <Avatar className="size-7" data-testid="face">
        <AvatarImage src="/ada.png" className="object-cover" />
        <AvatarFallback className="text-2xs">AL</AvatarFallback>
      </Avatar>,
    )
    expect(face().className).toMatch(/\brounded-full\b.*\bsize-7\b/)
    expect(image()?.className).toMatch(/\bobject-cover\b/)
    expect(screen.getByText("AL").className).toMatch(/\[\[data-avatar-loaded\]>&\]:hidden.*\btext-2xs\b/)
  })
})
