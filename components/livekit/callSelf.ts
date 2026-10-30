// Your own tile while the call connects (DB-27's should-fix).
//
// LiveKit names your own part, its identity and its name, only from the join's
// answer, so until the call connects it has neither: a signed-in member's own
// tile read "Guest", and its face "G". The call's token already says both, and
// LiveKit names you from it, so until LiveKit does, your tile takes them from
// the token. It reads your name, in the colour it keeps, from the first frame.

import { createContext, useContext } from "react"
import type { Participant } from "livekit-client"

import { jwtClaims } from "@/lib/jwt"

/** Who a tile is: LiveKit's identity and name for a part. */
export interface TileWho {
  identity: string
  name: string
}

/** Who the call's token says you are (its sub and name), or null without a readable one. Pure. */
export function callSelfOf(token?: string): TileWho | null {
  const claims = token ? jwtClaims(token) : null
  const identity = typeof claims?.sub === "string" ? claims.sub : ""
  if (!identity) return null
  return { identity, name: typeof claims?.name === "string" ? claims.name : "" }
}

/** Who you are in the call the stage shows: VideoConference reads it from the call's token. */
export const CallSelfContext = createContext<TileWho | null>(null)

/** A tile's identity and name: LiveKit's, or the token's for your own part until LiveKit names it. Pure. */
export function tileWho(who: Pick<Participant, "identity" | "name" | "isLocal">, self: TileWho | null): TileWho {
  if (who.isLocal && !who.identity && self) return self
  return { identity: who.identity || "", name: who.name || "" }
}

/** tileWho, for a tile on the call's stage. */
export function useTileWho(who: Pick<Participant, "identity" | "name" | "isLocal">): TileWho {
  return tileWho(who, useContext(CallSelfContext))
}
