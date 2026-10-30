import { IdentityMark } from "./IdentityMark"
import { avatarSeed } from "@/lib/utils/getAvatarColor"

/**
 * People as a row of faces (design v3): up to max of them, 20px unless said,
 * overlapping on a ring of the surface, each named by its tooltip. A share
 * dialog's people and a table's people cell draw the same faces.
 */
export function Faces({ people, size = 20, max = 3 }: { people: { user_uuid: string; name: string }[]; size?: number; max?: number }) {
  if (people.length === 0) return null
  return (
    <span className="flex -space-x-1.5">
      {people.slice(0, max).map((p) => (
        <span key={p.user_uuid} className="rounded-full ring-2 ring-background" title={p.name}>
          <IdentityMark variant="avatar" size={size} id={avatarSeed(p.name)} label={p.name} />
        </span>
      ))}
    </span>
  )
}
