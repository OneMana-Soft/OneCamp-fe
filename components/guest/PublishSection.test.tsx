import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const api = vi.hoisted(() => ({ publishLink: vi.fn(), unpublishLink: vi.fn() }))
vi.mock("@/lib/publish/publish", async (importOriginal) => ({ ...(await importOriginal<object>()), ...api }))

const { PublishSection } = await import("@/components/guest/PublishSection")

const view = { id: "g-1", capability: "view" as const, expires_at: null, created_at: "", mine: true }
const published = { ...view, slug: "launch-notes-1a2b3c4d", url: "https://app.example.test/p/launch-notes-1a2b3c4d", page_url: "https://api.example.test/public/p/launch-notes-1a2b3c4d", indexable: false, allow_copies: false, has_password: false }

function refusal(status: number, msg: string) {
  return Object.assign(new Error(msg), { isAxiosError: true, response: { status, data: { msg } } })
}

afterEach(() => {
  cleanup()
  for (const f of Object.values(api)) f.mockReset()
})

describe("publishing a doc's link as a web page", () => {
  it("is a view link's option; a comment link is told how", () => {
    render(<PublishSection links={[{ ...view, capability: "comment" }]} onChanged={() => {}} />)
    expect(screen.getByText(/make a “Can view” link: a published page is read-only/)).toBeTruthy()
    cleanup()
    render(<PublishSection links={[view]} publishAllowed={false} onChanged={() => {}} />)
    expect(screen.getByText("This workspace doesn't let pages be published to the web.")).toBeTruthy()
  })

  it("publishes the view link, and shows its address", async () => {
    api.publishLink.mockResolvedValue(published)
    const changed = vi.fn()
    const { rerender } = render(<PublishSection links={[view]} onChanged={changed} />)
    fireEvent.click(screen.getByRole("switch", { name: "Publish as a web page" }))
    await waitFor(() => expect(api.publishLink).toHaveBeenCalledWith("g-1", { indexable: false, allow_copies: false }))
    expect(changed).toHaveBeenCalledWith(published)
    rerender(<PublishSection links={[published]} onChanged={changed} />)
    // One address row: the field, with Copy address and Open beside it.
    expect((screen.getByRole("textbox", { name: "The page's address" }) as HTMLInputElement).value).toBe("launch-notes-1a2b3c4d")
    expect(screen.getAllByRole("button", { name: "Copy address" })).toHaveLength(1)
    const a = screen.getByRole("link", { name: "Open the page" })
    expect(a.getAttribute("href")).toBe(published.url)
    expect(a.getAttribute("rel")).toBe("noopener noreferrer")
    expect(screen.getByRole("switch", { name: "Let search engines find this page" }).getAttribute("aria-checked")).toBe("false")
  })

  it("changes one setting, keeping the rest, and its address", async () => {
    api.publishLink.mockResolvedValue({ ...published, indexable: true })
    render(<PublishSection links={[published]} onChanged={() => {}} />)
    fireEvent.click(screen.getByRole("switch", { name: "Let search engines find this page" }))
    await waitFor(() => expect(api.publishLink).toHaveBeenCalledWith("g-1", { slug: published.slug, indexable: true, allow_copies: false }))
    api.publishLink.mockRejectedValueOnce(refusal(409, "Another page has that address. Try another one."))
    fireEvent.change(screen.getByRole("textbox", { name: "The page's address" }), { target: { value: "Our Launch" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await screen.findByText("Another page has that address. Try another one.")
    expect(api.publishLink).toHaveBeenLastCalledWith("g-1", { slug: "our-launch", indexable: false, allow_copies: false })
  })

  it("refuses a password under six characters before sending it, with the server's words", async () => {
    render(<PublishSection links={[published]} onChanged={() => {}} />)
    fireEvent.click(screen.getByRole("switch", { name: "Require a password" }))
    expect(screen.getByLabelText("Password").getAttribute("placeholder")).toBe("At least 6 characters")
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "abcde" } })
    fireEvent.click(screen.getByRole("button", { name: "Set password" }))
    expect(await screen.findByText("A password is 6 to 128 characters.")).toBeTruthy()
    expect(api.publishLink).not.toHaveBeenCalled()
  })

  it("sets a password, takes it off, and unpublishes", async () => {
    api.publishLink.mockResolvedValue({ ...published, has_password: true })
    api.unpublishLink.mockResolvedValue(view)
    const { rerender } = render(<PublishSection links={[published]} onChanged={() => {}} />)
    fireEvent.click(screen.getByRole("switch", { name: "Require a password" }))
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "open sesame" } })
    fireEvent.click(screen.getByRole("button", { name: "Set password" }))
    await waitFor(() => expect(api.publishLink).toHaveBeenCalledWith("g-1", { slug: published.slug, indexable: false, allow_copies: false, password: "open sesame" }))
    rerender(<PublishSection links={[{ ...published, has_password: true }]} onChanged={() => {}} />)
    fireEvent.click(screen.getByRole("switch", { name: "Require a password" }))
    await waitFor(() => expect(api.publishLink).toHaveBeenLastCalledWith("g-1", { slug: published.slug, indexable: false, allow_copies: false, password: "" }))
    fireEvent.click(screen.getByRole("switch", { name: "Publish as a web page" }))
    await waitFor(() => expect(api.unpublishLink).toHaveBeenCalledWith("g-1"))
  })
})
