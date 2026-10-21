import { ProjectsGet } from "@/services/endpoints/projects"

/** Where a project's statuses are read and kept (hooks/useProjectStatuses). */
export const projectStatusesKey = (projectId: string) => `${ProjectsGet.ProjectStatuses}/${projectId}/statuses`
