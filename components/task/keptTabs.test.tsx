import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useEffect, useState } from "react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { KeptTab, useSeenTabs, useTabInAddress } from "@/components/task/keptTabs"

afterEach(cleanup)

function Counter({ name }: { name: string }) {
  const [n, setN] = useState(0)
  return (
    <button type="button" onClick={() => setN(n + 1)}>
      {name} {n}
    </button>
  )
}

function Page() {
  const [tab, setTab] = useState("list")
  const seen = useSeenTabs(tab)
  const inAddress = useTabInAddress()
  useEffect(() => inAddress("tab", tab), [tab, inAddress])
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="list">List</TabsTrigger>
        <TabsTrigger value="board">Board</TabsTrigger>
      </TabsList>
      <KeptTab value="list" selected={tab === "list"} seen={seen.has("list")}>
        <Counter name="list" />
      </KeptTab>
      <KeptTab value="board" selected={tab === "board"} seen={seen.has("board")}>
        <Counter name="board" />
      </KeptTab>
    </Tabs>
  )
}

const choose = (name: string) => act(() => void fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0 }))

describe("tabs kept once seen", () => {
  it("builds a tab when it's first chosen, and keeps it, state and all, when another is", () => {
    render(<Page />)
    expect(screen.queryByText(/^board/)).toBeNull()
    act(() => screen.getByText("list 0").click())
    const listButton = screen.getByText("list 1")
    choose("Board")
    expect(screen.getByText("board 0")).toBeTruthy()
    choose("List")
    // The list was hidden, not unmounted: the same element, its count intact.
    // (Its effects pause while hidden and run again when it's shown.)
    expect(screen.getByText("list 1")).toBe(listButton)
  })

  it("keeps the tab in the address without a navigation", () => {
    window.history.replaceState(null, "", "/app/project/p?tab=list")
    render(<Page />)
    choose("Board")
    expect(new URL(window.location.href).searchParams.get("tab")).toBe("board")
    expect(window.location.pathname).toBe("/app/project/p")
  })
})
