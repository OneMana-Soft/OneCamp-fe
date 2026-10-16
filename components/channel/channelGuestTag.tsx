import { cn } from "@/lib/utils/helpers/cn"

/**
 * A channel that people outside the workspace can read (the server's
 * has_guest_access: a live guest link, guest access on): a quiet "Guests" tag
 * after its name, in its header and in the channel lists. Its members could
 * not tell that a client was reading along.
 *
 * The v3 tag (18px, r5, 11/510) in the sun a guest's own name carries
 * (PrincipalTag's Guest, design v3 §3.10), so "outside the workspace" reads
 * the same on a person and on a channel. The server leaves the field out when
 * it is false, and live updates never carry it: missing is false.
 */
export function ChannelGuestTag({ className }: { className?: string }) {
  return (
    <span
      data-channel-guests=""
      title="People outside the workspace can read this channel through a guest link"
      className={cn("tag text-3xs shrink-0 bg-camp-sun-tint text-camp-sun-ink", className)}
    >
      <span aria-hidden="true">Guests</span>
      <span className="sr-only">Open to guests</span>
    </span>
  )
}
