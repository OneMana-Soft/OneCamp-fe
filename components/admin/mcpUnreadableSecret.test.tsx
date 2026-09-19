import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { McpServerEditDialog } from "@/components/admin/McpServerEditDialog"
import type { McpServer } from "@/services/mcpService"

vi.mock("@/services/mcpService", async (orig) => ({
    ...(await orig<typeof import("@/services/mcpService")>()),
    listMcpCatalog: vi.fn().mockResolvedValue([]),
}))

// A server whose secret cannot be decrypted is enabled, has a URL, and lists
// the tools it last reported. It is contributing none of them. An AI answer
// says "configured but unreachable" and sends an admin here, so here is where
// it has to be legible, and the one thing the secret field must not do is
// offer to keep a value that cannot be read.

const broken: McpServer = {
    id: "s1",
    name: "GitHub",
    url: "https://api.githubcopilot.com/mcp/",
    transport: "http",
    auth_type: "bearer",
    has_auth_secret: false,
    auth_secret_unreadable: true,
    enabled: true,
    tool_prefix: "mcp_github_",
    tools_cache: "[]",
    created_at: "",
    updated_at: "",
}

describe("a connector whose secret cannot be decrypted", () => {
    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
    })

    it("does not offer to keep the unreadable secret", () => {
        render(<McpServerEditDialog open server={broken} onClose={() => {}} onSaved={() => {}} />)
        const secret = document.querySelector("#mcp-secret") as HTMLInputElement
        expect(secret.placeholder).toBe("Enter the secret again")
        expect(document.body.textContent).toContain("cannot be decrypted and cannot be kept")
    })

    it("still offers to keep a secret that is readable", () => {
        render(
            <McpServerEditDialog
                open
                server={{ ...broken, auth_secret_unreadable: false, has_auth_secret: true }}
                onClose={() => {}}
                onSaved={() => {}}
            />,
        )
        const secret = document.querySelector("#mcp-secret") as HTMLInputElement
        expect(secret.placeholder).toContain("leave blank to keep")
        expect(document.body.textContent).not.toContain("cannot be kept")
    })
})
