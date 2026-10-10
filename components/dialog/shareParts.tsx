"use client"

import * as React from "react"
import { addressOrHandleOf, displayNameOf } from "@/lib/personName"
import { Button } from "@/components/ui/button"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { Tile } from "@/components/ui/graphics/Tile"
import { Check, Copy, Globe, Lock, X } from "@/lib/icons"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { cn } from "@/lib/utils/helpers/cn"
import type { UserProfileDataInterface } from "@/types/user"

/**
 * What a doc's and a board's share dialogs have in common: a person with
 * access, the general access line, and Copy link. One copy of each, so the two
 * dialogs read alike.
 */

const ROLE_WORD: Record<string, string> = { owner: "Owner", editor: "Editor", commenter: "Commenter", viewer: "Viewer" }

/**
 * One person with access. The role sits in a column of one width with the
 * remove button's slot kept even where there is none, so every role ends on
 * one line: the owner's ("Owner") stood 40px right of every editor's. Faces are
 * in their own hues, as everywhere else, not grey letters.
 */
export function ShareUserRow({ user, role, onRemove, canRemove }: { user: UserProfileDataInterface; role: string; onRemove?: () => void; canRemove: boolean }) {
  const { src } = useUserAvatar(user.user_profile_object_key)
  const name = displayNameOf(user) || "Someone"
  const secondLine = addressOrHandleOf(user)
  return (
    <div className="group flex min-h-12 items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-highlight/60" data-share-row="">
      <IdentityMark variant="avatar" size={32} id={user.user_uuid} label={name} src={src} />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        {secondLine && <span className="block truncate text-xs text-muted-foreground">{secondLine}</span>}
      </div>
      <span className="w-20 shrink-0 text-right text-xs text-muted-foreground" data-share-role="">
        {ROLE_WORD[role] ?? role}
      </span>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center">
        {canRemove && role !== "owner" && onRemove && (
          <Button
            aria-label={`Remove ${name}'s access`}
            variant="ghost"
            size="icon"
            className="extend-touch-target h-6 w-6 text-muted-foreground opacity-0 transition-opacity hover:text-danger-ink focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
            onClick={onRemove}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </span>
    </div>
  )
}

/** The people a dialog lists, the owner once: an owner also listed as an editor showed twice. */
export function withoutOwner<T extends { user_uuid: string }>(list: T[] | undefined, ownerId?: string): T[] {
  return (list ?? []).filter((u) => u.user_uuid !== ownerId)
}

/**
 * The general access line's mark: a lock on a quiet tile, or a globe on the
 * sky tile, never the accent (it is for the one action on a view).
 */
export function GeneralAccessMark({ restricted }: { restricted: boolean }) {
  return restricted ? (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&>svg]:size-4">
      <Lock aria-hidden="true" />
    </span>
  ) : (
    <Tile hue="sky" size="md">
      <Globe aria-hidden="true" />
    </Tile>
  )
}

/**
 * What general access means, in true words: a doc or board that is not
 * restricted is open to everyone in the workspace, signed in. It said "Anyone
 * on the internet with the link can view", which is what Share to web (a guest
 * link) is for, and not what this setting does.
 */
export function generalAccessLine(value: "restricted" | "public" | "public_comment", noun: "doc" | "board"): string {
  if (value === "restricted") return `Only the people above can open this ${noun}.`
  if (value === "public_comment") return `Everyone in the workspace can find it, read it and comment.`
  return `Everyone in the workspace can find it and read it.`
}

/** Copy link: a quiet outline button like the dialog's other secondary actions. */
export function CopyLinkButton() {
  const [copied, setCopied] = React.useState(false)
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn("gap-2", copied && "text-success-ink")}
      onClick={() => {
        void navigator.clipboard?.writeText(window.location.href)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
    >
      {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      {copied ? "Copied" : "Copy link"}
    </Button>
  )
}
