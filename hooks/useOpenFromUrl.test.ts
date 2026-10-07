import { describe, expect, it } from "vitest"
import { openRequest, openableFromUrl } from "./useOpenFromUrl"

describe("openableFromUrl", () => {
  it("opens the creation dialogs a link may ask for", () => expect(openableFromUrl("createProject")).toBe("createProject"))
  it("ignores anything else", () => {
    expect(openableFromUrl("editProjectMember")).toBeNull()
    expect(openableFromUrl(null)).toBeNull()
  })
})

describe("what an address asks to open", () => {
  const ask = (q: string, path = "/app/home") => openRequest(new URLSearchParams(q), path)

  it("opens New project on a template the link names", () => {
    expect(ask("open=createProject&template=client-project&tab=all")).toEqual({ key: "createProject", templateId: "client-project", used: ["open", "template"] })
    expect(ask("open=createProject&template=0b6b5f0e-1111-4000-8000-000000000000")?.templateId).toBe("0b6b5f0e-1111-4000-8000-000000000000")
  })

  it("ignores a template that isn't one, and a template on another dialog", () => {
    expect(ask("open=createProject&template=../admin")?.templateId).toBeUndefined()
    expect(ask("open=createTeam&template=client-project")).toEqual({ key: "createTeam", templateId: undefined, used: ["open", "template"] })
  })

  it("reads ?new= as the short form on the projects page only", () => {
    expect(ask("new=event", "/app/project")).toEqual({ key: "createProject", templateId: "event", used: ["new"] })
    expect(ask("new=1", "/app/project")).toEqual({ key: "createProject", templateId: undefined, used: ["new"] })
    expect(ask("new=event", "/app/home")).toBeNull()
    expect(ask("new=event", "/app/projects-elsewhere")).toBeNull()
  })

  it("asks for nothing without a parameter", () => expect(ask("tab=all", "/app/project")).toBeNull())
})
