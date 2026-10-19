import { act } from "react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AppBootScreen } from "@/components/protectedRoute/Splash"
import { APP_BOOT_NAME_ATTR, APP_BOOT_SCRIPT, endAppBoot } from "@/lib/appBoot"
import { WORKSPACE_NAME_STORE_KEY } from "@/lib/workspaceName"

// Design review PG1-01, coordinator, 15 Oct 2026: the boot screen said the
// name the web app was built with, so a self-hosted workspace renamed on its
// server opened as its old name. The screen is drawn before any code has run,
// so the boot script says the name the server gave last time in this browser
// (hooks/useWorkspaceName keeps it), and React keeps that as it hydrates.

let host: HTMLDivElement

/** The layout's static splash, as the server sends it, then the boot script as the browser runs it. */
function firstPaint(url: string, stored?: string) {
  window.history.replaceState({}, "", url)
  if (stored === undefined) localStorage.removeItem(WORKSPACE_NAME_STORE_KEY)
  else localStorage.setItem(WORKSPACE_NAME_STORE_KEY, stored)
  host.innerHTML = renderToString(<AppBootScreen className="app-boot" />)
  new Function(APP_BOOT_SCRIPT)()
}

// What it says while it opens: the line, not the slow note kept hidden under it.
const said = () => host.querySelector("[data-app-boot-screen] .splash-opening")?.textContent
const slot = () => host.querySelector(`[${APP_BOOT_NAME_ATTR}]`)

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_ORG_NAME", "one camp")
  host = document.createElement("div")
  document.body.appendChild(host)
})
afterEach(() => {
  window.history.replaceState({}, "", "/")
  endAppBoot()
  host.remove()
  localStorage.removeItem(WORKSPACE_NAME_STORE_KEY)
  vi.unstubAllEnvs()
})

describe("the boot screen's workspace name", () => {
  it("is the one the server gave last time, as it was written", () => {
    firstPaint("/app/home", "kestrel studio")
    expect(said()).toBe("Opening kestrel studio")
  })

  it("is the build's when the server has given none here, and off an app address is left alone", () => {
    firstPaint("/app/home")
    expect(said()).toBe("Opening one camp")
    firstPaint("/signup", "Kestrel Studio")
    expect(said()).toBe("Opening one camp")
  })

  it("is only ever text", () => {
    firstPaint("/app/home", '<img src=x onerror="alert(1)">')
    expect(slot()?.children.length).toBe(0)
    expect(said()).toBe('Opening <img src=x onerror="alert(1)">')
  })

  it("stays the server's as the page hydrates, with no hydration error", async () => {
    firstPaint("/app/home", "Kestrel Studio")
    const errors: unknown[] = []
    await act(async () => {
      hydrateRoot(host, <AppBootScreen className="app-boot" />, {
        onRecoverableError: (e) => errors.push(e),
      })
    })
    expect(errors).toEqual([])
    expect(said()).toBe("Opening Kestrel Studio")
  })
})
