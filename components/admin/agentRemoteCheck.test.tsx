import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { AgentEditDialog } from "@/components/admin/AgentEditDialog"
import { checkRemoteBrain } from "@/services/agentService"

// The editor's lists (servers, models, channels, projects) are not under test,
// and a real fetch leaves SWR's retry timer running after the page is gone.
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined, isLoading: false, mutate: vi.fn() }) }))

vi.mock("@/services/agentService", async (orig) => ({
    ...(await orig<typeof import("@/services/agentService")>()),
    listAgentSkills: vi.fn().mockResolvedValue([]),
    checkRemoteBrain: vi.fn(),
}))

// An admin pointing an agent at a remote endpoint should learn that the
// address is wrong or the secret is stale while typing it, not from a failed
// run somebody finds afterwards.

function openDialog() {
    return render(<AgentEditDialog open agent={null} onClose={() => {}} onSaved={() => {}} />)
}

async function typeEndpointAndTest(url = "https://bots.example.com/ag-ui") {
    fireEvent.change(await screen.findByLabelText(/Remote agent/i), { target: { value: url } })
    fireEvent.click(screen.getByText("Test connection"))
}

describe("testing a remote agent endpoint from the editor", () => {
    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
    })

    it("offers the test only once an endpoint is given", async () => {
        openDialog()
        await screen.findByLabelText(/Remote agent/i)
        expect(screen.queryByText("Test connection")).toBeNull()
        fireEvent.change(screen.getByLabelText(/Remote agent/i), { target: { value: "https://bots.example.com" } })
        expect(screen.getByText("Test connection")).toBeTruthy()
    })

    it("shows what the remote said, and what it sent to ask", async () => {
        vi.mocked(checkRemoteBrain).mockResolvedValue({ ok: true, reply: "I received it." })
        openDialog()
        await typeEndpointAndTest()

        await waitFor(() => expect(screen.getByText(/The remote answered: I received it\./)).toBeTruthy())
        expect(vi.mocked(checkRemoteBrain).mock.calls[0][0]).toMatchObject({
            endpoint: "https://bots.example.com/ag-ui",
            // Blank: the client never sees a stored secret, so a saved agent is
            // tested with the one the server already holds.
            auth_secret: "",
        })
    })

    it("shows why it did not work instead of leaving the admin guessing", async () => {
        vi.mocked(checkRemoteBrain).mockResolvedValue({ ok: false, error: "remote answered 401: Unauthorized." })
        openDialog()
        await typeEndpointAndTest()
        await waitFor(() => expect(screen.getByText(/401/)).toBeTruthy())
    })

    it("says so when the check itself could not run", async () => {
        vi.mocked(checkRemoteBrain).mockRejectedValue({ response: { data: { msg: "remote agent endpoint must use http or https" } } })
        openDialog()
        await typeEndpointAndTest("ftp://bots.example.com")
        await waitFor(() => expect(screen.getByText(/must use http or https/)).toBeTruthy())
    })

    it("says the daily token limit cannot apply to a remote agent", async () => {
        openDialog()
        await screen.findByLabelText(/Remote agent/i)
        expect(screen.queryByText(/cannot meter it/)).toBeNull()
        fireEvent.change(screen.getByLabelText(/Remote agent/i), { target: { value: "https://bots.example.com" } })
        expect(screen.getByText(/cannot meter it/)).toBeTruthy()
    })
})

// The rule that decides whether workspace content may leave the building is
// stated before the save, not discovered from a failed run.
describe("what the editor says before you save a remote endpoint", () => {
    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
    })

    // Asserted as facts rather than as sentences, so the copy can be rewritten
    // without the test having an opinion about the wording.
    it("says https and a secret are required, and what is at stake", async () => {
        openDialog()
        fireEvent.change(await screen.findByLabelText(/Remote agent/i), {
            target: { value: "https://bots.example.com/ag-ui" },
        })
        const text = document.body.textContent || ""
        expect(text).toMatch(/https/)
        expect(text).toMatch(/secret/)
        expect(text).toMatch(/own network/)
        // The reason, not just the rule: what a run actually sends there.
        expect(text).toMatch(/instructions/)
        expect(text).toMatch(/tool result/)
        // And that the workspace still governs the calls it asks for.
        expect(text).toMatch(/permission, approval and audit/)
    })

    // The whole point of the rewrite: it has to be readable at a glance.
    it("keeps the guidance short enough to read", async () => {
        openDialog()
        const before = (document.body.textContent || "").length
        fireEvent.change(await screen.findByLabelText(/Remote agent/i), {
            target: { value: "https://bots.example.com/ag-ui" },
        })
        const added = (document.body.textContent || "").length - before
        // Two short lines plus the auth labels and the button. This was three
        // paragraphs once, which is the regression the bound exists to catch;
        // it is set with room for a rewording, not for another paragraph.
        expect(added).toBeLessThan(600)
    })
})

// Bringing another organisation's agent in: the admin names the protocol, the
// check reads its card, and the editor says plainly that it gets no tools here.
describe("an A2A agent as the remote", () => {
    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
    })

    async function chooseA2A() {
        openDialog()
        fireEvent.change(await screen.findByLabelText(/^Remote agent$/i), {
            target: { value: "https://agents.example.com" },
        })
        const a2a = screen.getByRole("radio", { name: "A2A" })
        fireEvent.click(a2a)
        return a2a
    }

    it("checks with the A2A protocol and shows who runs it and what it can do", async () => {
        vi.mocked(checkRemoteBrain).mockResolvedValue({
            ok: true,
            reply: "Ready.",
            card: {
                name: "Contracts Reviewer",
                provider: "Acme Legal",
                endpoint: "https://agents.example.com/a2a",
                skills: [{ id: "nda", name: "Review an NDA" }],
            },
        })
        await chooseA2A()
        fireEvent.click(screen.getByText("Test connection"))

        await waitFor(() => expect(screen.getByText("Contracts Reviewer")).toBeTruthy())
        expect(vi.mocked(checkRemoteBrain).mock.calls[0][0]).toMatchObject({ protocol: "a2a" })
        expect(screen.getByText(/by Acme Legal/)).toBeTruthy()
        expect(screen.getByText("Review an NDA")).toBeTruthy()
        expect(screen.getByText(/agents\.example\.com\/a2a/)).toBeTruthy()
    })

    it("says what leaves the workspace and that it cannot change anything", async () => {
        await chooseA2A()
        const text = document.body.textContent || ""
        expect(text).toMatch(/not this agent's instructions or knowledge/)
        expect(text).toMatch(/given no tools here/)
        expect(text).not.toMatch(/permission, approval and audit/)
    })
})
