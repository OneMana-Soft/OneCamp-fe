import { describe, expect, it } from "vitest"

import { LONG, shapeLabel, urlLabel } from "./urlLabel"

// Small-details L4: a long pasted link is labelled from its shape, with no
// fetch, and its address is left as it is.
describe("a long link's label", () => {
  it.each([
    ["https://github.com/OneMana-Soft/OneCamp/issues/412#issuecomment-1", "OneMana-Soft/OneCamp#412"],
    ["https://github.com/OneMana-Soft/OneCamp/pull/1187/files?diff=split", "OneMana-Soft/OneCamp#1187"],
    ["https://github.com/OneMana-Soft/OneCamp/commit/3f9a1c2b7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a", "OneMana-Soft/OneCamp@3f9a1c2"],
    ["https://github.com/OneMana-Soft/OneCamp/blob/main/business/Unfurl/unfurl.go", "OneMana-Soft/OneCamp › unfurl.go"],
    ["https://gitlab.com/onemana/platform/-/merge_requests/58#note_12", "onemana/platform!58"],
    ["https://linear.app/onemana/issue/ENG-231/paste-a-link-and-get-a-menu", "ENG-231"],
    ["https://onemana.atlassian.net/browse/OPS-1203?focusedCommentId=1", "OPS-1203"],
    ["https://onemana.atlassian.net/jira/software/projects/OPS/boards/1?selectedIssue=OPS-77", "OPS-77"],
    ["https://www.figma.com/design/AbC123xyz/Launch-plan-v2?node-id=1-2&t=x", "Launch plan v2"],
    ["https://www.notion.so/onemana/Quarterly-planning-0123456789abcdef0123456789abcdef", "Quarterly planning"],
    ["https://www.nytimes.com/2026/10/12/technology/ai-agents-office-work.html?smid=x", "nytimes.com › ai agents office work"],
    ["https://example.com/?utm_source=newsletter&utm_medium=email&utm_campaign=autumn", "example.com"],
  ])("%s reads %s", (href, label) => {
    expect(href.length).toBeGreaterThan(LONG)
    expect(urlLabel(href)).toBe(label)
  })

  it("leaves a short link, and anything that isn't a web address, as it is", () => {
    expect(urlLabel("https://github.com/a/b/issues/1")).toBeNull()
    expect(urlLabel("mailto:someone-with-a-very-long-address@example-company-name.com")).toBeNull()
    expect(urlLabel("not a link at all, but long enough to be over the threshold")).toBeNull()
  })
})

// A bookmark or a link mention is called by its link's shape, however short,
// until the page's own title is read: never just "github.com".
describe("a card's label", () => {
  it.each([
    ["https://github.com/a/b/issues/1", "a/b#1"],
    ["https://linear.app/x/issue/ENG-2/y", "ENG-2"],
    ["https://example.com/pricing", "example.com › pricing"],
    ["https://www.example.com/", "example.com"],
  ])("%s reads %s", (href, label) => expect(shapeLabel(href)).toBe(label))

  it("is nothing for an address that isn't a web one", () => {
    expect(shapeLabel("mailto:sam@example.com")).toBeNull()
    expect(shapeLabel("not a link")).toBeNull()
  })
})
