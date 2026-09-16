import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

/**
 * The invitation dialog used to close on "sent successfully" no matter what,
 * and a fresh install cannot send anything. So the first thing a new admin did
 * after setup was invite a colleague and wait for an email that was never
 * going to come. These pin the two halves of the fix: the dialog says up front
 * when nothing will be sent, and it hands over the link either way.
 */

let emailEnabled = true
let answer: { invite_link?: string; email_sent?: boolean } = {
    invite_link: "https://onecamp.example.com/signup?token=abc",
    email_sent: false,
}
const makeRequest = vi.fn(async () => answer)

vi.mock("@/hooks/useClientConfig", () => ({
    useClientConfig: () => ({ email_enabled: emailEnabled }),
}))
vi.mock("@/hooks/usePost", () => ({
    usePost: () => ({ makeRequest, isSubmitting: false }),
}))
vi.mock("@/hooks/useFetch", () => ({
    useFetch: () => ({ data: { data: [] }, mutate: async (fn?: () => Promise<unknown>) => (fn ? fn() : undefined) }),
}))
vi.mock("@/hooks/useCopyToClipboard", () => ({
    useCopyToClipboard: () => ({ copied: false, copy: vi.fn(async () => true) }),
}))

const { AddInvitationDialog } = await import("./AddInvitationDialog")

afterEach(() => {
    cleanup()
    emailEnabled = true
    makeRequest.mockClear()
})

function open() {
    const onOpenChange = vi.fn()
    render(<AddInvitationDialog open onOpenChange={onOpenChange} onSuccess={() => {}} />)
    return onOpenChange
}

describe("inviting someone on a server that cannot send email", () => {
    it("says so before the admin types anything", () => {
        emailEnabled = false
        open()
        expect(screen.getByText(/cannot send email yet/i)).toBeTruthy()
        expect(screen.getByRole("button", { name: /create invitation/i })).toBeTruthy()
    })

    it("stays open and hands over the link", async () => {
        emailEnabled = false
        answer = { invite_link: "https://onecamp.example.com/signup?token=abc", email_sent: false }
        const onOpenChange = open()

        fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "sam@example.com" } })
        fireEvent.submit(screen.getByRole("button", { name: /create invitation/i }).closest("form")!)

        await waitFor(() => expect(screen.getByRole("textbox", { name: "Invitation link" })).toBeTruthy())
        expect((screen.getByRole("textbox", { name: "Invitation link" }) as HTMLInputElement).value).toBe(
            "https://onecamp.example.com/signup?token=abc",
        )
        expect(screen.getByRole("button", { name: /copy invitation link/i })).toBeTruthy()
        expect(screen.getByText(/nothing was sent/i)).toBeTruthy()
        expect(onOpenChange).not.toHaveBeenCalledWith(false)
    })
})

describe("inviting someone when email works", () => {
    it("offers to send, and still shows the link afterwards", async () => {
        emailEnabled = true
        answer = { invite_link: "https://onecamp.example.com/signup?token=xyz", email_sent: true }
        open()
        expect(screen.getByRole("button", { name: /send invitation/i })).toBeTruthy()

        fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "sam@example.com" } })
        fireEvent.submit(screen.getByRole("button", { name: /send invitation/i }).closest("form")!)

        await waitFor(() => expect(screen.getByText(/invitation sent/i)).toBeTruthy())
        expect(screen.getByText(/in case it does not arrive/i)).toBeTruthy()
    })
})
