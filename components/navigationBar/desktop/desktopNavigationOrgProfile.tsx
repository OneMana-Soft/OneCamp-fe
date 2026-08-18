"use client"
import Link from "next/link"
import { OrgAvatarNav } from "@/components/navigationBar/orgAvatarNav"
import { app_home_path } from "@/types/paths"

/**
 * The workspace mark in the top-left of the desktop nav.
 *
 * It used to render a <Button> with no handler at all — the dropdown it was
 * meant to open (Profile / Logout, with placeholder data still in it) had been
 * commented out, leaving a control that was focusable, had a hover state, and
 * did nothing when clicked. OrgAvatarNav even sets `hover:cursor-pointer`, so it
 * actively advertised itself as clickable. An affordance that does nothing is
 * worse than no affordance: the user concludes the app is broken, in the most
 * prominent spot on the screen.
 *
 * It is a link to home rather than a restored menu. Account and sign-out already
 * live in DesktopNavigationUserProfile on the right of the same bar, so a second
 * menu here would duplicate them; and clicking the workspace mark to get home is
 * the convention users arrive with, which is presumably why they were clicking
 * it. So the fix keeps the affordance the element was already promising and
 * makes it real.
 */
export default function DesktopNavigationOrgProfile() {
  const orgName = process.env.NEXT_PUBLIC_ORG_NAME
  return (
    <Link
      href={app_home_path}
      // Names the destination, not the picture: a reader hears where the link
      // goes rather than "workspace, link", which says nothing about activating it.
      aria-label={orgName ? `${orgName} — go to home` : "Go to home"}
      className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <OrgAvatarNav />
    </Link>
  )
}
