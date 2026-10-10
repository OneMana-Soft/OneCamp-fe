import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// The row every add-member picker draws (channels, projects, teams, docs,
// boards, DMs, an event's participants, a goal's owner): the name, and under
// it the address. The demo's shared visitor gets other members' addresses
// blank, and the line under the name was an empty grey gap.

vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: "" }) }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKind: () => undefined }))
vi.mock("@/components/ui/botTag", () => ({ BotTag: () => null }))

const { Command, CommandList } = await import("@/components/ui/command")
const { UserComboboxItem } = await import("@/components/combobox/userComboboxItem")

afterEach(cleanup)

function row(person: { userEmail?: string; userHandle?: string }) {
  render(
    <Command>
      <CommandList>
        <UserComboboxItem userUuid="u-maya" userName="Maya Chen" isSelected={false} onSelect={() => {}} {...person} />
      </CommandList>
    </Command>,
  )
  const name = screen.getByText("Maya Chen")
  // The text column: the name, then the line under it, if any.
  return Array.from(name.parentElement!.children).slice(1).map((el) => el.textContent ?? "")
}

describe("a person in a member picker", () => {
  it("has the address under the name", () => {
    expect(row({ userEmail: "maya@example.com", userHandle: "maya" })).toEqual(["maya@example.com"])
  })
  it("has the handle under the name when the address is blank", () => {
    expect(row({ userEmail: "", userHandle: "maya" })).toEqual(["@maya"])
  })
  it("has no line under the name with neither", () => {
    expect(row({ userEmail: "", userHandle: "" })).toEqual([])
  })
})
