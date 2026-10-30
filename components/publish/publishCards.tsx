"use client"

// The cards a published page's address shows in place of the page (docs C6):
// its password, and every other state, on the public pages' shared card
// (SecretCard). Apart from PublishedRoute, so a link's page (/guest/d)
// carries only these.

import * as React from "react"

import { LockTile, PublicCard, SecretForm } from "@/components/guest/SecretCard"
import { Tile } from "@/components/ui/graphics/Tile"
import { unlockPage, type PageRef } from "@/lib/publish/publish"
import { sendFailedText } from "@/services/publicApi"

/** Where the browser goes for the page: replaced, so Back skips this address. A seam for tests. */
export const go = {
  to: (url: string) => window.location.replace(url),
  signIn: () => window.location.assign("/"),
  again: () => window.location.reload(),
}

/** A published page's card: no guest band, its glyph on a neutral tile (a page or a copy names no area of the app). */
export function Card({ icon, ...card }: { icon: React.ReactNode; title: string; line: string; children?: React.ReactNode; high?: boolean }) {
  return (
    <PublicCard
      band={false}
      tile={
        <Tile hue="ink" size="lg" data-publish-tile="">
          {icon}
        </Tile>
      }
      {...card}
    />
  )
}

/** A password page's way in, with the lock a room's passcode shows: its password, then the page with its unlock. For an address or a link's token. */
export function UnlockPage({ pageRef }: { pageRef: PageRef }) {
  return (
    <PublicCard high band={false} tile={<LockTile />} title="This page needs a password" line="Whoever shared it with you has its password.">
      <SecretForm
        label="Password"
        action="Open the page"
        autoComplete="current-password"
        onSubmit={async (password) => {
          const res = await unlockPage(pageRef, password)
          if (res.ok && res.data?.url) {
            go.to(res.data.url)
            return undefined
          }
          return res.ok ? "" : res.status === 401 ? "That password doesn't open this page." : sendFailedText(res)
        }}
      />
    </PublicCard>
  )
}
