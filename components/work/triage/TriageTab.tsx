"use client"
// A project's Triage tab (linear-21 H3), the one entry both tab registries draw
// (components/project/projectTaskDesktop and projectListTabs) while the project's info says triage
// is on. The queue is a chunk of its own, loaded when the tab is opened, and it imports none of the
// shared core (app/triageLazy.test): this hands it the page's calls, the project's statuses and the
// shared empty, error and loading states. The settings sheet is its admins', as in the project's tools.
import { useState } from "react"
import dynamic from "next/dynamic"
import { loadRuleDialogs } from "@/components/project/ProjectToolButtons"
import { TabLoading } from "@/components/task/TabLoading"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { useProjectCalls } from "@/hooks/useProjectCalls"
import { useProjectStatuses } from "@/hooks/useProjectStatuses"
import { Inbox } from "@/lib/icons"
import { lazyView } from "@/lib/lazy/lazyView"

const View = lazyView(() => import("@/components/work/triage/TriageQueue"))
// The sheet comes through the project tools' one loader of the rule dialogs (projectRuleDialogs), as the tools' own does.
const TriageSettings = dynamic(() => loadRuleDialogs().then((m) => m.TriageSettings), { loading: () => null })

export function TriageTab({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const calls = useProjectCalls(projectId)
  const { options } = useProjectStatuses(projectId)
  const [settings, setSettings] = useState<boolean | null>(null)
  return (
    <>
      <View.View
        fallback={<TabLoading kind="list" />}
        render={(m) => (
          <m.default
            projectId={projectId}
            calls={calls}
            canManage={canManage}
            onSettings={() => setSettings(true)}
            statuses={options}
            failed={(retry, detail) => <ErrorState subject="the triage queue" compact detail={detail} onRetry={retry} />}
            empty={(state) => <EmptyState icon={Inbox} {...state} />}
            loading={<TabLoading kind="list" />}
          />
        )}
      />
      {canManage && settings !== null && <TriageSettings projectId={projectId} calls={calls} open={settings} onOpenChange={setSettings} />}
    </>
  )
}
