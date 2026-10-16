"use client"

import { useCallback } from "react"
import { useConfirm } from "@/hooks/useConfirm"
import { usePost } from "@/hooks/usePost"
import { PostEndpointUrl } from "@/services/endPoints"
import type { ProjectAddOrRemoveInterface } from "@/types/project"

/**
 * Archiving a project, and restoring one, after one question: the one way
 * the app does it, from the project's own actions, its team's page and the
 * phone's long press. The team page and the long press each had their own
 * copy, and the project itself had none (PTC-13); one asked "UnArchive
 * project" (PTC-55). `done` runs once the server has taken it.
 */
export function useArchiveProject() {
  const confirm = useConfirm()
  const post = usePost()

  const archive = useCallback(
    (projectId: string, { name, done }: { name?: string; done?: () => void } = {}) =>
      confirm({
        title: "Archive project",
        description: `${name ? `Archive ${name}?` : "Archive this project?"} Its members lose access until it is restored. Nothing in it is deleted.`,
        confirmText: "Archive project",
        destructive: true,
        onConfirm: () =>
          post.makeRequest<ProjectAddOrRemoveInterface>({ apiEndpoint: PostEndpointUrl.DeleteProject, payload: { project_uuid: projectId } }).then(() => done?.()),
      }),
    [confirm, post],
  )

  const restore = useCallback(
    (projectId: string, { name, done }: { name?: string; done?: () => void } = {}) =>
      confirm({
        title: "Restore project",
        description: `${name ? `Restore ${name}?` : "Restore this project?"} Its members can open it again.`,
        confirmText: "Restore project",
        onConfirm: () =>
          post.makeRequest<ProjectAddOrRemoveInterface>({ apiEndpoint: PostEndpointUrl.UndeleteProject, payload: { project_uuid: projectId } }).then(() => done?.()),
      }),
    [confirm, post],
  )

  return { archive, restore }
}
