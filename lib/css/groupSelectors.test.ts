// @vitest-environment node
import postcss from "postcss"
import selectorParser from "postcss-selector-parser"
import { describe, expect, it } from "vitest"
import groupSelectors, { rewriteRuleSelector, rewriteSelector, specificity } from "./groupSelectors.mjs"

const spec = (text: string) => specificity(selectorParser().astSync(text))
const run = (css: string) => postcss([groupSelectors()]).process(css, { from: undefined }).css

// Every rewrite keeps the selector's specificity, so the cascade between rules is unchanged.
function expectRewrite(before: string, after: string) {
  expect(rewriteSelector(before)).toBe(after)
  expect(spec(after)).toEqual(spec(before))
}
const expectKept = (text: string) => expect(rewriteSelector(text)).toBeNull()

describe("groupSelectors: the shapes it rewrites", () => {
  it("group-* state variants become a descendant combinator", () => {
    expectRewrite(".group-hover\\:flex:is(:where(.group):hover *)", ":where(.group):hover .group-hover\\:flex")
    expectRewrite(
      ".group-focus-visible\\:ring-2:is(:where(.group):focus-visible *)",
      ":where(.group):focus-visible .group-focus-visible\\:ring-2",
    )
    expectRewrite(
      ".group-focus-within\\:opacity-100:is(:where(.group):focus-within *)",
      ":where(.group):focus-within .group-focus-within\\:opacity-100",
    )
  })

  it("named groups keep their name", () => {
    expectRewrite(
      ".group-hover\\/cell\\:opacity-100:is(:where(.group\\/cell):hover *)",
      ":where(.group\\/cell):hover .group-hover\\/cell\\:opacity-100",
    )
  })

  it("data and aria attribute groups", () => {
    expectRewrite(
      '.group-data-\\[state\\=open\\]\\:rotate-180:is(:where(.group)[data-state="open"] *)',
      ':where(.group)[data-state="open"] .group-data-\\[state\\=open\\]\\:rotate-180',
    )
    expectRewrite(
      '.group-aria-expanded\\:block:is(:where(.group)[aria-expanded="true"] *)',
      ':where(.group)[aria-expanded="true"] .group-aria-expanded\\:block',
    )
  })

  it("peer-* variants become a sibling combinator", () => {
    expectRewrite(
      ".peer-checked\\:block:is(:where(.peer):checked ~ *)",
      ":where(.peer):checked ~ .peer-checked\\:block",
    )
    expectRewrite(
      ".peer-disabled\\/x\\:opacity-50:is(:where(.peer\\/x):disabled ~ *)",
      ":where(.peer\\/x):disabled ~ .peer-disabled\\/x\\:opacity-50",
    )
  })

  it(":not() and :has() inside the group, with pseudo-classes every supported browser parses", () => {
    expectRewrite(
      ".group-not-hover\\:hidden:is(:where(.group):not(:hover) *)",
      ":where(.group):not(:hover) .group-not-hover\\:hidden",
    )
    expectRewrite(
      ".group-has-checked\\:flex:is(:where(.group):has(:checked) *)",
      ":where(.group):has(:checked) .group-has-checked\\:flex",
    )
  })

  it("a nested :is()/:where() keeps its forgiving list, whatever it holds", () => {
    expectRewrite(
      ".group-open\\:rotate-90:is(:where(.group):is([open],:popover-open,:open) *)",
      ":where(.group):is([open],:popover-open,:open) .group-open\\:rotate-90",
    )
  })

  it("the rest of the compound stays with the class, pseudo-elements after it included", () => {
    expectRewrite(
      ".group-hover\\:before\\:opacity-100:is(:where(.group):hover *)::before",
      ":where(.group):hover .group-hover\\:before\\:opacity-100::before",
    )
    expectRewrite("li.x:is(:where(.group):hover *):first-child", ":where(.group):hover li.x:first-child")
    expectRewrite(".x:where(.dark, .dark *):is(:where(.group):hover *)", ":where(.group):hover .x:where(.dark, .dark *)")
  })

  it("other single complex selectors in the same shape (a dark variant, a bare :is())", () => {
    expectRewrite(".dark\\:text-white:is(.dark *)", ".dark .dark\\:text-white")
    expectRewrite(":is(.dark *)", ".dark *")
  })

  it("the nested form Tailwind writes outside production (`&`)", () => {
    expectRewrite("&:is(:where(.group):hover *)", ":where(.group):hover &")
    expect(run(".a{&:is(:where(.group):hover *){color:red}}")).toBe(".a{:where(.group):hover &{color:red}}")
    // `&` anchors the selector, in a nested rule and under @scope alike; a list's other selectors stay relative.
    expect(run("@scope (.a){.x&:is(.dark *){color:red}}")).toBe("@scope (.a){.dark .x&{color:red}}")
    expect(run(".a{&:is(.dark *),.x:is(.dark *){color:red}}")).toBe(".a{.dark &,.x:is(.dark *){color:red}}")
  })

  it("each selector of a rule's list on its own; @media and other wrappers stay", () => {
    expect(
      rewriteRuleSelector(".a:is(:where(.group):hover *), .b:is(:where(.group\\/x):hover *), .c:hover"),
    ).toBe(":where(.group):hover .a,:where(.group\\/x):hover .b,.c:hover")
    expect(run("@media (hover: hover){.a:is(:where(.group):hover *){opacity:1}}")).toBe(
      "@media (hover: hover){:where(.group):hover .a{opacity:1}}",
    )
  })
})

describe("groupSelectors: the shapes it leaves alone", () => {
  it("a list inside :is()", () => {
    expectKept(".x:is(:where(.group):hover *, :where(.group):focus *)")
    expectKept(".x:is(.a *, #b *)")
  })

  it("two group/peer variants on one class (nested variants)", () => {
    expectKept(".x:is(:where(.group):hover *):is(:where(.peer):checked ~ *)")
    expectKept(".x:is(:where(.group\\/a):hover *):is(:where(.group\\/b):focus *)")
  })

  it("a selector with combinators of its own", () => {
    expectKept("[data-line] span:is(.dark *)")
    expectKept(".a > .x:is(:where(.group):hover *)")
  })

  it("other combinators inside :is(), and an argument that does not end in a bare *", () => {
    expectKept(".x:is(:where(.group):hover > *)")
    expectKept(".x:is(:where(.peer):checked + *)")
    expectKept(".x:is(:where(.group):hover .y)")
    expectKept(".x:is(:where(.group):hover *.y)")
    expectKept(".x:is(:where(.group):hover svg|*)")
    expectKept(".x:is(*)")
    expectKept(".x:is(> *)")
  })

  it(":where() and :not() wrappers of the same shape", () => {
    expectKept(".x:where(:where(.group):hover *)")
    expectKept(".x:not(:where(.group):hover *)")
  })

  it("pseudo-elements in the group, or before the :is()", () => {
    expectKept(".x:is(.a::before *)")
    expectKept(".x:is(.a:after *)")
    expectKept(".x::before:is(:where(.group):hover *)")
  })

  it("a pseudo-class some supported browser cannot parse, outside a nested :is()/:where()", () => {
    expectKept(".x:is(:where(.group):popover-open *)")
    expectKept(".x:is(:where(.group):open *)")
    expectKept(".x:is(:where(.group):user-invalid *)")
    expectKept(".x:is(:where(.group):not(:popover-open) *)")
    expectKept(".x:is(:where(.group):has(:open) ~ *)")
  })

  it("`&` inside the group, comments, and text that does not parse", () => {
    expectKept(".x:is(& *)")
    expectKept(".x:is(.a /* c */ *)")
    expectKept(".x:is(:where(.group")
    expect(rewriteRuleSelector(".a, .b:hover")).toBeNull()
  })

  // CSS nesting reads `.a{.x:is(.g *)}` as `.a .x:is(.g *)` (.g anywhere above .x); `.a{.g .x}` is `.a .g .x`.
  it("a rule nested in another rule without `&`, also through @media", () => {
    for (const css of [
      ".a{.x:is(:where(.group):hover *){color:red}}",
      ".a{.x:is(:where(.peer):checked ~ *){color:red}}",
      ".a{@media (hover:hover){.x:is(.dark *){color:red}}}",
    ])
      expect(run(css)).toBe(css)
  })

  it("a rule under @scope without `&` (relative to the scope root)", () => {
    for (const css of [
      "@scope (.a){.x:is(:where(.group):hover *){color:red}}",
      "@scope (.a) to (.b){@media (hover:hover){.x:is(.dark *){color:red}}}",
    ])
      expect(run(css)).toBe(css)
  })

  it("keyframe steps and rules without :is() are not touched", () => {
    const css = "@keyframes k{from{opacity:0}50%{opacity:.5}}.a:hover{color:red}"
    expect(run(css)).toBe(css)
  })
})

describe("groupSelectors: specificity", () => {
  it("counts ids, classes and types the way the cascade does", () => {
    expect(spec(".a")).toEqual([0, 1, 0])
    expect(spec("#a .b c")).toEqual([1, 1, 1])
    expect(spec(":where(.group):hover *")).toEqual([0, 1, 0])
    expect(spec(".x:is(.a, #b)")).toEqual([1, 1, 0])
    expect(spec(".x:not(.a):has(> b)")).toEqual([0, 2, 1])
    expect(spec("a::before")).toEqual([0, 0, 2])
    expect(spec("a:before")).toEqual([0, 0, 2])
    expect(spec('[data-state="open"]')).toEqual([0, 1, 0])
    expect(spec("&:hover")).toEqual([0, 1, 0])
    expect(spec("li:nth-child(2n of .x)")).toBeNull()
  })

  it("leaves a rule whose specificity it cannot tell", () => {
    expectKept(".x:is(:where(.group):nth-child(2n of .y) *)")
  })
})
