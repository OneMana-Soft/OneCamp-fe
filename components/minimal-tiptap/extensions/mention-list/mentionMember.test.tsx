import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// A row in the @mention picker names the person by the one name rule and
// shows the handle they are mentioned by. It used to show only user_name, so
// someone with no display name was a blank row.

vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: "" }) }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKind: () => undefined }))
vi.mock("@/components/ui/botTag", () => ({ BotTag: () => null }))

import MentionMember from "./mentionMember"
import type { UserProfileDataInterface } from "@/types/user"

afterEach(cleanup)

const row = (person: Partial<UserProfileDataInterface>) =>
  render(
    <MentionMember
      person={{ user_uuid: "u1", user_name: "", user_profile_object_key: "", ...person } as UserProfileDataInterface}
      ind={0}
      selectedIndex={0}
      selectItem={() => {}}
    />,
  )

describe("a mention picker row", () => {
  it("shows the name and then @handle", () => {
    row({ user_name: "Sam", user_full_name: "Samuel Rivera", user_handle: "srivera" })
    expect(screen.getByText("Sam")).toBeInTheDocument()
    expect(screen.getByText("@srivera")).toBeInTheDocument()
  })

  it("names someone with no display name by their full name", () => {
    row({ user_name: "", user_full_name: "Maya Chen", user_handle: "maya" })
    expect(screen.getByText("Maya Chen")).toBeInTheDocument()
  })
})
