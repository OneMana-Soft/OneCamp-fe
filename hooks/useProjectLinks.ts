"use client"

// A project's links (basecamp-16), in its order, as cards the server read from
// their pages, and what its admins do with them: add one, rename it, delete it
// (Undo brings it back through restoreService). Every change reads the list
// again, as the server names, orders and pictures each link. Errors carry the
// server's words, written for the person.
//
// The project's home strip and its Links dialog read the one list: both call
// this with the same key, so SWR asks once. The dialog is a chunk of its own
// and takes what this returns as props, so its chunk imports none of the
// shared core (main's chunking rule, 30 Oct).

import { useCallback } from "react"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { useFetch } from "@/hooks/useFetch"
import { listOnceRead } from "@/lib/utils/listOf"
import { projectLinksPath, type ProjectLink, type ProjectLinksAnswer } from "@/lib/work/projectLinks"

export function useProjectLinks(projectId: string | undefined) {
  const key = projectId ? projectLinksPath(projectId) : ""
  const read = useFetch<ProjectLinksAnswer>(key, undefined, undefined, OWN_ERRORS)
  const { data, mutate } = read

  const post = useCallback(
    async (path: string, body: object) => {
      await axiosInstance.post(`${key}${path}`, body, OWN_ERRORS)
      await mutate()
    },
    [key, mutate],
  )
  /** The server reads the page and keeps its card; a title, when given, names it. */
  const add = useCallback((url: string, title = "") => post("", { url, title }), [post])
  const rename = useCallback((id: string, title: string) => post(`/${encodeURIComponent(id)}/edit`, { title }), [post])
  const remove = useCallback((id: string) => post(`/${encodeURIComponent(id)}/delete`, {}), [post])

  // None is an empty list however the server says it (V-51), so only an
  // answer not read yet reads as not read.
  const links = listOnceRead<ProjectLinksAnswer, ProjectLink>(data, (a) => a.data?.links)
  return {
    links,
    /** The list couldn't be read, and nothing read earlier stands in. */
    failed: !!read.isError && links === undefined,
    retry: () => void mutate(),
    readAgain: () => mutate(),
    canManage: !!data?.data?.can_manage,
    add,
    rename,
    remove,
    // The client, for restoreService's restore: the lazy dialog may not import it itself (V-49).
    http: axiosInstance,
  }
}

export type ProjectLinks = ReturnType<typeof useProjectLinks>
