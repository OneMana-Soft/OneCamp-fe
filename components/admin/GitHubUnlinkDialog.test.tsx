import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import GitHubUnlinkDialog from "./GitHubUnlinkDialog"

/**
 * The unlink dialog says what unlinking does. It said it would clear the
 * GitHub details of this project's linked tasks and remove the repository's
 * webhook. Unlinking takes only the repository's issues and pull requests off
 * the project's tasks, so their links to the project's other repositories
 * stay, and the webhook stays while another project still links the
 * repository.
 */
describe("GitHubUnlinkDialog", () => {
    afterEach(cleanup)

    it("says what unlinking takes off, and when the webhook stays", () => {
        render(
            <GitHubUnlinkDialog
                open
                onOpenChange={() => {}}
                onConfirm={() => {}}
                isSubmitting={false}
                link={{ id: "link-1", repo_owner: "acme", repo_name: "web" }}
            />,
        )
        const text = document.body.textContent ?? ""
        expect(text).not.toMatch(/clear github details/i)
        expect(text).toMatch(/links to the project's other repositories stay/i)
        expect(text).toMatch(/unless another project still links it/i)
        expect(screen.getByRole("button", { name: "Unlink repository" })).toBeTruthy()
    })
})
