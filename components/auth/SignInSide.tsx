import { Orbit, Rings } from "@/components/ui/graphics/motifs"

/**
 * Beside the sign-in form, from lg up: the logo's ring, extended into the
 * playful layer's motif, quietly. Faint concentric rings in the line colour,
 * and an orbit of six hued dots (the people and channels round a workspace)
 * whose centre is the ring in muted ink. Decorative (AuthShell hides the side
 * from screen readers) and still: it explains nothing a person must read, so
 * it does not move.
 */
export function SignInSide() {
  return (
    <div className="relative flex w-full items-center justify-center overflow-hidden border-l border-border bg-muted/40">
      <Rings size={640} count={4} core={false} className="absolute text-border" />
      <Orbit size={320} dots={6} className="relative text-muted-foreground" />
    </div>
  )
}
