import { describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach } from "vitest"
import { Sparkles } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"

// Adding the accent tone touched the ONE component that 30+ surfaces already
// render, so the contract worth locking is that the default rendering did not
// move: existing callers pass no tone and must look exactly as before. The
// accent assertions then pin the presentation the admin cards used to hand-roll,
// so a future tidy-up of the primitive can't silently restyle them.

afterEach(cleanup)

describe("EmptyState", () => {
  it("renders title, description and action", () => {
    render(
      <EmptyState
        title="No agents yet"
        description="Try a standup agent."
        action={<button>Create</button>}
      />,
    )
    // The title is a heading, not a paragraph: an empty state is a landmark a
    // screen-reader user should be able to jump to.
    expect(screen.getByRole("heading", { name: "No agents yet" })).toBeTruthy()
    expect(screen.getByText("Try a standup agent.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Create" })).toBeTruthy()
  })

  // 10 Oct 2026 design pass: the icon no longer sits in a tinted chip (grey
  // circle for muted, orange tile for accent). The design direction bans an
  // icon inside a tinted chip, and the orange tile spent the accent on an
  // illustration. These assertions changed on purpose; the tones now differ by
  // scale, and no tone paints the icon in the accent.
  it("defaults to the muted tone: a small bare muted icon and small description", () => {
    const { container } = render(
      <EmptyState icon={Sparkles} title="Nothing here" description="Quiet copy." />,
    )
    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain("px-6")
    const icon = container.querySelector("[data-empty-icon]") as SVGElement
    expect(icon.getAttribute("class")).toContain("size-5")
    expect(icon.getAttribute("class")).toContain("text-muted-foreground")
    expect(container.querySelector(".rounded-full.bg-muted")).toBeNull()
    expect(container.querySelector(".bg-primary\\/10")).toBeNull()
    // Muted descriptions stay on the smaller scale with the narrower measure.
    expect(screen.getByText("Quiet copy.").className).toContain("text-xs")
  })

  it("accent tone is larger, never orange: bigger bare icon, body-size description", () => {
    const { container } = render(
      <EmptyState tone="accent" icon={Sparkles} title="No tables yet" description="Track anything." />,
    )
    const shell = container.firstElementChild as HTMLElement
    expect(shell.className).toContain("px-4")
    const icon = container.querySelector("[data-empty-icon]") as SVGElement
    expect(icon.getAttribute("class")).toContain("size-7")
    expect(icon.getAttribute("class")).not.toContain("text-primary")
    expect(container.querySelector(".bg-primary\\/10")).toBeNull()
    expect(screen.getByText("Track anything.").className).toContain("text-sm")
  })

  it("lets a caller override the shell without losing the tone", () => {
    const { container } = render(
      <EmptyState
        tone="accent"
        icon={Sparkles}
        title="No templates yet"
        className="rounded-2xl border border-border/60 px-6 py-16"
      />,
    )
    const shell = container.firstElementChild as HTMLElement
    // cn is tailwind-merge, so the caller's padding replaces the tone default
    // rather than both landing in the class list.
    expect(shell.className).toContain("px-6")
    expect(shell.className).not.toContain("px-4")
    expect(shell.className).toContain("border")
    expect(container.querySelector("[data-empty-icon]")?.getAttribute("class")).toContain("size-7")
  })

  it("gives the muted description a readable measure the caller can change", () => {
    render(<EmptyState title="No docs" description="Docs you write show up here." />)
    expect(screen.getByText("Docs you write show up here.").className).toContain("max-w-[45ch]")
    cleanup()
    render(<EmptyState title="No docs" description="Wide copy." descriptionClassName="max-w-prose" />)
    const p = screen.getByText("Wide copy.")
    expect(p.className).toContain("max-w-prose")
    expect(p.className).not.toContain("max-w-[45ch]")
  })

  it("omits the icon entirely when no icon is given", () => {
    const { container } = render(<EmptyState title="No results" />)
    expect(container.querySelector("[data-empty-icon]")).toBeNull()
    expect(container.querySelector(".rounded-full.bg-muted")).toBeNull()
    expect(container.querySelector(".bg-primary\\/10")).toBeNull()
  })
})
