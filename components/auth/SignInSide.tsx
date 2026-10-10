import { Orbit, Rings } from "@/components/ui/graphics/motifs"

/**
 * Beside the sign-in form, from lg up: the logo's ring, extended into the
 * playful layer's motif, quietly. Faint concentric rings in the line colour,
 * and an orbit of six hued dots (the people and channels round a workspace)
 * around the workspace itself: the logo, the motif's one hero instance in the
 * brand's own colours. Decorative (AuthShell hides the side from screen
 * readers) and still: it explains nothing a person must read, so it does not
 * move.
 */
export function SignInSide() {
  return (
    <div className="relative flex w-full items-center justify-center overflow-hidden border-l border-border bg-muted/40">
      <Rings size={640} count={4} core={false} className="absolute text-border" />
      <div className="relative">
        <Orbit size={320} dots={6} center={false} className="text-muted-foreground" />
        {/* eslint-disable-next-line @next/next/no-img-element -- the static logo, as in AuthShell's header */}
        <img
          src="/logo.svg"
          alt=""
          width={64}
          height={64}
          className="absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2"
        />
      </div>
    </div>
  )
}
