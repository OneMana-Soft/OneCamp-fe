import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"

let path = "/app/task/t1"
vi.mock("next/navigation", () => ({ usePathname: () => path, useSearchParams: () => new URLSearchParams() }))
vi.mock("react-redux", () => ({ useSelector: () => ({}) }))

import { DocumentTitle } from "@/components/common/DocumentTitle"
import { usePageName } from "./pageName"

function Named({ name }: { name?: string }) {
  usePageName(name)
  return null
}

afterEach(() => {
  cleanup()
  path = "/app/task/t1"
})

// A task's page was titled "Task · OneCamp" and a goal's "OneCamp": the
// sidebar can't name either, so the page names itself (PTC-38).
describe("usePageName", () => {
  it("titles the tab with the name the open page gives itself", () => {
    render(
      <>
        <DocumentTitle />
        <Named name="Book the launch retro" />
      </>,
    )
    expect(document.title).toBe("Book the launch retro · OneCamp")
  })

  it("falls back to the section until the name is known, and once the page closes", () => {
    const view = render(
      <>
        <DocumentTitle />
        <Named />
      </>,
    )
    expect(document.title).toBe("Task · OneCamp")
    view.rerender(
      <>
        <DocumentTitle />
        <Named name="Book the launch retro" />
      </>,
    )
    expect(document.title).toBe("Book the launch retro · OneCamp")
    act(() =>
      view.rerender(
        <>
          <DocumentTitle />
        </>,
      ),
    )
    expect(document.title).toBe("Task · OneCamp")
  })

  it("never names another address", () => {
    path = "/app/goals/g1"
    const view = render(<Named name="Reach 500 paying teams" />)
    path = "/app/goals"
    render(<DocumentTitle />)
    expect(document.title).toBe("Goals · OneCamp")
    view.unmount()
  })
})
