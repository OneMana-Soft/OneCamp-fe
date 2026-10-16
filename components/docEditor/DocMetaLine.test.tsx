import * as React from "react"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { Editor } from "@tiptap/react"
import { DocMetaLine } from "./DocMetaLine"
import { createDocCommandBus, DocBusContext } from "./registry/commandBus"
import { setPresence, type DocPresence } from "./presence/store"

// "Edited just now by Maya" (P3, B8): someone else's edit, seen live through
// presence with no request, names them under the title; a first name two
// people here share is said in full.

const editor = { isDestroyed: false, getText: () => "", on() {}, off() {} } as unknown as Editor
const bus = createDocCommandBus("doc-1")

afterEach(() => {
  cleanup()
  setPresence("doc-1", null)
})

const line = () =>
  render(
    <DocBusContext.Provider value={bus}>
      <DocMetaLine editor={editor} authorName="Sam Rivera" lastEditedRelative="6 hours ago" padded="" />
    </DocBusContext.Provider>,
  )

const presence = (people: DocPresence["people"], edit: DocPresence["edit"]): DocPresence => ({ people, edit, self: "u-me" })

describe("the line under a doc's title", () => {
  it("says when it was last edited, from the doc, while nobody edits live", () => {
    line()
    expect(screen.getByText("Edited 6 hours ago")).toBeTruthy()
  })

  it("names who edited just now, by first name", () => {
    setPresence("doc-1", presence({ "u-maya": { clients: [2], name: "Maya Chen", idle: false } }, { userId: "u-maya", name: "Maya Chen", at: Date.now() }))
    line()
    expect(screen.getByText("Edited just now by Maya")).toBeTruthy()
  })

  it("says a shared first name in full", () => {
    setPresence(
      "doc-1",
      presence(
        { "u-sam-1": { clients: [2], name: "Sam Rivera", idle: false }, "u-sam-2": { clients: [3], name: "Sam Okafor", idle: false } },
        { userId: "u-sam-2", name: "Sam Okafor", at: Date.now() },
      ),
    )
    line()
    expect(screen.getByText("Edited just now by Sam Okafor")).toBeTruthy()
  })
})
