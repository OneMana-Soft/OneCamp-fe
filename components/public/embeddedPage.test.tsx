import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { CornerCard } from "@/components/ui/CornerStack"
import { EmbeddedPage, SHELL_CORNERS } from "./EmbeddedPage"

// A page another site frames keeps OneCamp's own corner cards (the install
// prompt, tips) off that site's page: its style hides the very hosts
// CornerStack draws them in, and only there.

const hosts = () => [...document.querySelectorAll<HTMLElement>("[data-corner-stack]")]

afterEach(() => {
  cleanup()
  for (const host of hosts()) host.remove()
})

describe("a page another site frames", () => {
  it("draws its own content and hides the shell's corner cards, on either side", () => {
    render(
      <EmbeddedPage>
        <p>The roadmap board</p>
        <CornerCard side="right">Add OneCamp to your Home Screen</CornerCard>
        <CornerCard side="left">Press ? for shortcuts</CornerCard>
      </EmbeddedPage>,
    )
    expect(screen.getByText("The roadmap board")).toBeTruthy()
    expect(hosts()).toHaveLength(2)
    for (const host of hosts()) {
      expect(host.matches(SHELL_CORNERS), host.className).toBe(true)
      expect(getComputedStyle(host).display).toBe("none")
    }
  })

  it("hides nothing on any other page", () => {
    render(<CornerCard side="right">Add OneCamp to your Home Screen</CornerCard>)
    expect(hosts()).toHaveLength(1)
    expect(getComputedStyle(hosts()[0]).display).not.toBe("none")
  })
})
