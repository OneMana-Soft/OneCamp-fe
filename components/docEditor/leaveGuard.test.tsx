import * as React from "react"
import * as Y from "yjs"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import type { HocuspocusProvider } from "@hocuspocus/provider"

import { useLeaveGuard } from "./leaveGuard"
import { offlineProvider } from "./docTestKit"

// A live doc keeps no local copy: edits the collaboration server hasn't
// confirmed live only in the tab. Closing it offline, or while the server was
// slow, lost them without a word: the page's guard watched an HTTP autosave a
// live doc never uses. These run a real provider that never connects, which
// is exactly the offline case: its count of unconfirmed updates only grows.

const providers: HocuspocusProvider[] = []
afterEach(() => {
  cleanup()
  while (providers.length) providers.pop()?.destroy()
})

function Guarded({ provider, pending }: { provider: HocuspocusProvider | null; pending?: () => boolean }) {
  useLeaveGuard({ provider, pending })
  return null
}

/** True when leaving now would be stopped with the browser's "Leave site?" question. */
function asksBeforeLeaving(): boolean {
  const e = new Event("beforeunload", { cancelable: true })
  window.dispatchEvent(e)
  return e.defaultPrevented
}

function mount(pending?: () => boolean) {
  const provider = offlineProvider()
  providers.push(provider)
  render(<Guarded provider={provider} pending={pending} />)
  return provider
}

describe("leaving a live doc", () => {
  it("goes quietly when nothing was typed", () => {
    mount()
    expect(asksBeforeLeaving()).toBe(false)
  })

  it("asks while an edit made here hasn't reached the server, as when offline", () => {
    const provider = mount()
    act(() => provider.document.getXmlFragment("default").insert(0, [new Y.XmlText("typed offline")]))
    expect(provider.unsyncedChanges).toBeGreaterThan(0)
    expect(asksBeforeLeaving()).toBe(true)
  })

  it("goes quietly once the server has confirmed every edit", () => {
    const provider = mount()
    act(() => provider.document.getXmlFragment("default").insert(0, [new Y.XmlText("typed")]))
    // The server's acknowledgement, as the provider handles it.
    act(() => provider.decrementUnsyncedChanges())
    expect(provider.unsyncedChanges).toBe(0)
    expect(asksBeforeLeaving()).toBe(false)
  })

  it("isn't fooled by someone else's edit, or by its own connection handshake", () => {
    const provider = mount()
    // A collaborator's change, applied by the provider: nothing of ours to lose.
    const theirs = new Y.Doc()
    theirs.getXmlFragment("default").insert(0, [new Y.XmlText("theirs")])
    act(() => Y.applyUpdate(provider.document, Y.encodeStateAsUpdate(theirs), provider))
    expect(asksBeforeLeaving()).toBe(false)
    // Every (re)connect counts its handshake as one unconfirmed change.
    act(() => provider.forceSync())
    expect(provider.unsyncedChanges).toBe(1)
    expect(asksBeforeLeaving()).toBe(false)
  })

  it("asks for anything else still pending (an HTTP save, an upload)", () => {
    let saving = true
    mount(() => saving)
    expect(asksBeforeLeaving()).toBe(true)
    saving = false
    expect(asksBeforeLeaving()).toBe(false)
  })

  it("is the doc page's guard, on its live provider", () => {
    const view = readFileSync(join(__dirname, "../views/DocView.tsx"), "utf8")
    expect(view).toMatch(/useLeaveGuard\(\{\s*provider: collaborationConfig\?\.enabled \? provider : null/)
    // The old guard read the HTTP autosave alone.
    expect(view).not.toMatch(/addEventListener\('beforeunload'/)
  })
})
