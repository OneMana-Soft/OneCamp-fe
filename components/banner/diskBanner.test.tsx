import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

let disk: Record<string, unknown> | undefined
const asked: string[] = []
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    asked.push(url)
    return { data: url && disk ? { data: disk } : undefined }
  },
}))
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))

const { DiskBanner } = await import("./DiskBanner")

afterEach(() => {
  cleanup()
  localStorage.clear()
  asked.length = 0
})

describe("the disk banner", () => {
  it("says nothing while there is room, and asks nothing for members", () => {
    disk = { available: true, used_pct: 40, free_bytes: 200e9, level: "ok" }
    const { container } = render(<DiskBanner isAdmin />)
    expect(container.textContent).toBe("")
    render(<DiskBanner isAdmin={false} />)
    expect(asked.at(-1)).toBe("")
  })

  it("warns from 85%, says how to free room, and can be put off for a day", () => {
    disk = { available: true, used_pct: 88, free_bytes: 12e9, level: "warn" }
    render(<DiskBanner isAdmin />)
    expect(screen.getByRole("status").textContent).toMatch(/88% full.*Remove for good.*make housekeeping/)
    fireEvent.click(screen.getByRole("button", { name: /dismiss for a day/i }))
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("cannot be dismissed when the disk is nearly full", () => {
    disk = { available: true, used_pct: 96, free_bytes: 2e9, level: "critical" }
    render(<DiskBanner isAdmin />)
    expect(screen.getByRole("alert").textContent).toMatch(/stops saving anything/)
    expect(screen.queryByRole("button", { name: /dismiss/i })).toBeNull()
  })
})
