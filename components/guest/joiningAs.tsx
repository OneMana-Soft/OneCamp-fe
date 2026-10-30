// Who joins, with their face: the member door's header, and a guest link's while "Join as …" leads.
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { avatarSeed } from "@/lib/utils/getAvatarColor"

export function JoiningAs({ name }: { name: string }) {
  return (
    <span data-joining-as="" className="inline-flex max-w-full min-w-0 items-center gap-2 align-middle">
      <IdentityMark variant="avatar" size={20} id={avatarSeed(name)} label={name} />
      <span className="truncate">Joining as {name}</span>
    </span>
  )
}
