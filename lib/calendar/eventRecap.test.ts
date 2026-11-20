import { describe, expect, it } from "vitest"
import { makeActionTaskRequest, projectsOf, recapToGuestsRequest } from "@/lib/calendar/eventRecap"

// gcal-new-event-notes, head B: what the event panel asks when a recap is used (head A's routes).
describe("a call's recap's requests", () => {
  it("makes an item a task by its event, call and place, into the project picked", () => {
    const r = makeActionTaskRequest("0c1d2e3f-0000-4000-8000-00000000d031_20261021T033000Z", "EG/today", 2, "p-1")
    expect(r).toMatchObject({ method: "POST", apiEndpoint: "/calendar/events", payload: { project_uuid: "p-1" }, showErrorToast: true })
    expect(r.appendToUrl).toBe("/0c1d2e3f-0000-4000-8000-00000000d031_20261021T033000Z/call/artefacts/EG%2Ftoday/action-items/2/task")
  })

  it("flips Send the recap to guests on the event", () => {
    expect(recapToGuestsRequest("ev 1", false)).toMatchObject({ method: "POST", appendToUrl: "/ev%201/call/recap-to-guests", payload: { on: false } })
  })

  it("offers the projects the reader is in, as the server lists them, and nothing from an answer it can't read", () => {
    const answer = {
      user_projects: [
        { project_uuid: "p-1", project_name: "Launch", project_deleted_at: "0001-01-01T00:00:00Z" },
        { project_uuid: "p-3", project_name: "Ops" },
        { project_name: "No id" },
      ],
    }
    expect(projectsOf(answer)).toEqual([{ uuid: "p-1", name: "Launch" }, { uuid: "p-3", name: "Ops" }])
    expect(projectsOf(undefined)).toEqual([])
    expect(projectsOf({ user_projects: "none" })).toEqual([])
  })
})
