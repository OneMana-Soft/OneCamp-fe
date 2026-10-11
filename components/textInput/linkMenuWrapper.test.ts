import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// Tiptap moves the link bubble's element out of the composer card. A sibling
// React mounts later (the Draft-with-AI anchor) is inserted before it, and
// inserting before a moved node throws insertBefore, which took the whole
// channel page down on the live demo. The bubble sits in a wrapper of its own.
describe("the composer's link bubble", () => {
    for (const file of ["components/textInput/chatComposerShell.tsx", "components/textInput/phoneComposerShell.tsx"]) {
        it(`${file} renders it inside a wrapper of its own`, () => {
            const src = readFileSync(file, "utf8")
            expect(src).toContain('<div className="contents">{linkMenu}</div>')
            expect(src).not.toMatch(/^\s*\{linkMenu\}\s*$/m)
        })
    }
})
