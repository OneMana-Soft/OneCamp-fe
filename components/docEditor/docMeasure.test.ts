import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import postcss, { type AtRule, type ChildNode, type Rule } from "postcss"
import { describe, expect, it } from "vitest"

// A doc's reading type (content.md D06, D07): body 16/26 at -0.011em in a
// 720 px measure, title 40/48 at 650 with opsz 32, and 16 px on a touch
// screen (iOS zooms into anything smaller). The body read 16/24: index.css
// set .doc-editor's line-height after importing doc.css, with the same
// selector, so it won. This resolves the cascade the way a browser does for
// equal selectors (the last declaration in import order wins), so a rule
// added anywhere in the editor's styles that overrides the doc's type fails
// here. e2e/docMeasure.spec.ts measures the same in a browser.

const root = join(__dirname, "..", "..")

/** Rules of a stylesheet and the ones it imports, in cascade order, with the media they sit in. */
function rulesOf(file: string, media = ""): Array<{ rule: Rule; media: string }> {
    const sheet = postcss.parse(readFileSync(file, "utf8"))
    const out: Array<{ rule: Rule; media: string }> = []
    const visit = (node: ChildNode, inMedia: string): void => {
        if (node.type === "atrule" && node.name === "import") {
            const target = node.params.replace(/^url\(|\)$/g, "").replace(/["']/g, "").trim()
            if (target.startsWith(".")) out.push(...rulesOf(join(dirname(file), target), inMedia))
        } else if (node.type === "atrule" && node.name === "media") {
            const at: AtRule = node
            at.each((child) => visit(child, at.params))
        } else if (node.type === "rule") {
            out.push({ rule: node, media: inMedia })
        }
    }
    sheet.each((node) => visit(node, media))
    return out
}

const editorRules = rulesOf(join(root, "components/minimal-tiptap/styles/index.css"))
const contentCss = readFileSync(join(root, "app/content.css"), "utf8")

/** The value a property ends with for a selector, outside any media query or inside the given one. */
function resolved(selector: string, prop: string, media = ""): string | undefined {
    let value: string | undefined
    for (const { rule, media: m } of editorRules) {
        if (m !== media) continue
        if (!rule.selectors.map((s) => s.trim()).includes(selector)) continue
        rule.walkDecls(prop, (d) => {
            value = d.value
        })
    }
    return value
}

const token = (name: string) => contentCss.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim()

describe("a doc's body type", () => {
    const body = ".minimal-tiptap-editor.doc-editor .ProseMirror"

    it("is 16/26, nothing later in the cascade setting it back to 24", () => {
        expect(resolved(body, "font-size")).toBe("1rem")
        expect(resolved(body, "line-height")).toBe("1.625rem")
        expect(resolved(`${body} p`, "line-height")).toBe("1.625rem")
    })

    it("tracks at -0.011em", () => {
        expect(resolved(body, "letter-spacing")).toBe("var(--doc-tracking-body)")
        expect(token("--doc-tracking-body")).toBe("-0.011em")
    })

    it("has no other rule for the doc's body that sets its leading", () => {
        const others = editorRules.filter(
            ({ rule, media }) =>
                !media &&
                rule.selectors.some((s) => /\.doc-editor\s+\.ProseMirror$/.test(s.trim()) && s.trim() !== body) &&
                rule.some((d) => d.type === "decl" && d.prop === "line-height"),
        )
        expect(others.map(({ rule }) => rule.selector)).toEqual([])
    })

    it("is 16px to type into on a touch screen", () => {
        expect(resolved('.minimal-tiptap-editor .ProseMirror[contenteditable="true"]', "font-size", "(pointer: coarse)")).toBe("1rem")
    })
})

describe("a doc's title", () => {
    it("is 40/48 at 650, opsz 32, -0.022em (PROGRAM D-1)", () => {
        expect(resolved(".doc-title", "font-size")).toBe("2.5rem")
        expect(resolved(".doc-title", "line-height")).toBe("3rem")
        expect(resolved(".doc-title", "font-weight")).toBe("650")
        expect(resolved(".doc-title", "font-variation-settings")).toBe('"opsz" 32')
        expect(resolved(".doc-title", "letter-spacing")).toBe("var(--doc-tracking-title)")
        expect(token("--doc-tracking-title")).toBe("-0.022em")
    })
})

describe("a doc's measure", () => {
    it("is 720 px of text, the page inset 32 px each side", () => {
        expect(token("--doc-measure")).toBe("720px")
        expect(resolved(".doc-measure", "max-width")).toBe("calc(var(--doc-measure) + 64px)")
    })
})
