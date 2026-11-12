import type { PlanLinks } from "@/types/plan"

/** Where an admin removes the limit: the server's licence link, until the Plan page (ADMIN-H6). Apart from the plan's words, which usePlan doesn't need. */
export const planHref = (links?: PlanLinks) => links?.licence
