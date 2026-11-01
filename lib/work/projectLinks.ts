// A project's links to the tools its people use elsewhere (basecamp-16): a
// Figma file, a Drive folder, a repository. The server reads each page once,
// through SafeFetch and Unfurl, and keeps its card: a title, its site, a few
// words, an icon and a preview picture (business/ProjectLink). Whoever may see
// the project reads them; its admins add, rename and delete them.
//
// Pure: no request is made here, so the project's strip and the lazy Links
// dialog share it without the dialog's chunk reaching the shared core.

import { apiUrl } from "@/lib/utils/apiUrl"

/** A link as GET /project/{p}/links lists it (business/ProjectLink View). */
export interface ProjectLink {
  id: string
  url: string
  host: string
  title: string
  description: string
  site_name: string
  has_icon: boolean
  has_image: boolean
  created_at: string
}

export interface ProjectLinksAnswer {
  msg?: string
  data?: { links: ProjectLink[] | null; can_manage: boolean }
}

/** What the server holds: at most 50 links a project, a title of at most 200 characters (business/ProjectLink). */
export const LINKS_MOST = 50
export const LINK_TITLE_MOST = 200

export const projectLinksPath = (projectId: string) => `/project/${projectId}/links`

/**
 * The address of a link's kept icon or preview picture: the API answers it
 * with a redirect to where the picture is kept, for whoever may see the
 * project. "" for a link without one, so nothing asks for a picture that
 * isn't there.
 */
export function linkPicture(
  projectId: string,
  link: Pick<ProjectLink, "id" | "has_icon" | "has_image">,
  kind: "icon" | "image",
  base?: string,
): string {
  if (!(kind === "icon" ? link.has_icon : link.has_image)) return ""
  const path = `${projectLinksPath(projectId)}/${encodeURIComponent(link.id)}/${kind}`
  return base === undefined ? apiUrl(path) : apiUrl(path, base)
}

/** Where a link goes, in a word or two: its site's own name, else its host. */
export const linkWhere = (link: Pick<ProjectLink, "site_name" | "host">) => link.site_name.trim() || link.host

/** "1 link", "4 links". */
export const linksWord = (n: number) => `${n} ${n === 1 ? "link" : "links"}`
