"use client"
// A project's triage sheet as the rule dialogs' group draws it (linear-21 H4; projectRuleDialogs exports it
// as TriageSettings, so the project's tools and the Triage tab load it as before). It hands the core-free
// settings the project's people, read through the key ProjectRulesDialog reads (one cache, one read), and
// opens that same rules dialog on the rules about arriving work: the sheet gives way to it and comes
// back when it closes, so a phone never stacks two drawers.
import { useState } from "react"
import { ProjectRulesDialog } from "@/components/work/rules/ProjectRulesDialog"
import { TriageSettings } from "@/components/work/triage/TriageSettings"
import { useFetch } from "@/hooks/useFetch"
import type { ProjectCalls } from "@/hooks/useProjectPolicy"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ProjectInfoRawInterface } from "@/types/project"

export function TriageSheet({ projectId, calls, open, onOpenChange }: { projectId: string; calls: ProjectCalls; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [rules, setRules] = useState(false)
  const members = useFetch<ProjectInfoRawInterface>(open ? `${GetEndpointUrl.GetProjectMembers}/${projectId}` : "", undefined, { revalidateOnFocus: false })
  return (
    <>
      <TriageSettings projectId={projectId} calls={calls} open={open && !rules} onOpenChange={onOpenChange}
        members={members.data?.data?.project_members} onArrivalRules={() => setRules(true)} />
      {open && rules && <ProjectRulesDialog projectId={projectId} arrival onClose={() => setRules(false)} />}
    </>
  )
}
