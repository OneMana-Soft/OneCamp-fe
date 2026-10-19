"use client"

// Tells the admins, once, that members now change tasks (Work Access, A1).
//
// WHY. Before roles, only a project's admins changed its tasks. Since A1 its
// members do too, unless the project (or the workspace) says otherwise: a
// wider rule nobody chose, so the people who run projects are told where to
// narrow it. The server decides whom it is for (the admins of projects made
// before the change, and the workspace's admins) and keeps the dismissal, so
// it is shown once per admin on every device.
//
// WHERE. On the projects and admin Permissions only, where its link leads
// (STEP4_PLAN #1, 17 Oct). It sat across the top of every page, the calendar
// and Settings among them: a row on a computer and about 100 px on a phone,
// in front of whatever the page was for.

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useState } from "react"
import { NoticeBar, noticeActionClass } from "@/components/banner/NoticeBar"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { app_admin, app_project_path } from "@/types/paths"
import { MEMBERS_EDIT_NOTICE, NOTICES_KEY, dismissNotice, type Notice } from "@/services/workAccessService"

/** Where the notice sends someone, and what the link says. Pure. */
export function noticeLink(n: Notice): { href: string; label: string; perProject: boolean } {
  const project = n.data?.project_uuid
  if (project) {
    const name = (n.data?.project_name || "").trim() || "your project"
    return { href: `${app_project_path}/${project}?tool=access`, label: `Who can change tasks in ${name}`, perProject: true }
  }
  return { href: "/app/admin?tab=permissions", label: "Permissions", perProject: false }
}

/** Whether the notice shows on a page: the projects, any project's pages, and admin Permissions. Pure. */
export function membersNoticeShowsOn(pathname: string, tab: string | null): boolean {
  if (pathname === app_project_path || pathname.startsWith(`${app_project_path}/`)) return true
  return pathname === app_admin && tab === "permissions"
}

export function MembersEditNotice() {
  const pathname = usePathname() ?? ""
  const tab = useSearchParams()?.get("tab") ?? null
  const here = membersNoticeShowsOn(pathname, tab)
  // Asked for only where it can show: elsewhere, no read on every page.
  const { data, mutate } = useFetch<{ data: { notices: Notice[] } }>(here ? NOTICES_KEY : "", undefined, { revalidateOnFocus: false }, OWN_ERRORS)
  // Dismissed here, gone at once; the server keeps it gone everywhere.
  const [dismissed, setDismissed] = useState(false)
  const notice = data?.data?.notices?.find((n) => n.key === MEMBERS_EDIT_NOTICE)
  if (!here || !notice || dismissed) return null
  const link = noticeLink(notice)
  const dismiss = async () => {
    setDismissed(true)
    await dismissNotice(MEMBERS_EDIT_NOTICE).catch(() => undefined)
    void mutate()
  }
  return (
    <NoticeBar
      tone="info"
      lead="Members can now change tasks in your projects."
      onDismiss={() => void dismiss()}
      action={
        <Link href={link.href} className={noticeActionClass} onClick={() => void dismiss()}>
          {link.label}
        </Link>
      }
    >
      {link.perProject ? "Choose who can, per project:" : "Choose who can, per project or for the whole workspace:"}
    </NoticeBar>
  )
}
