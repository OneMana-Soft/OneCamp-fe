"use client"

// A project's Releases tab (P10-1b web; jira-04, linear-36), the one entry
// both tab registries draw (components/project/projectTaskDesktop and
// projectListTabs). The view is a chunk of its own, loaded when the tab is
// opened, and it imports none of the shared core (main's chunking rule, 30
// Oct; app/releasesLazy.test): this hands it the page's HTTP client, whether
// this edition drafts notes with the AI, and the shared empty and error states.

import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { TabLoading } from "@/components/task/TabLoading"
import { useAIAvailable } from "@/hooks/useClientConfig"
import axiosInstance from "@/lib/axiosInstance"
import { Rocket } from "@/lib/icons"
import { lazyView } from "@/lib/lazy/lazyView"

const View = lazyView(() => import("@/components/work/releases/ProjectReleases"))

export function ReleasesTab({ projectId }: { projectId: string }) {
  const ai = useAIAvailable()
  return (
    <View.View
      fallback={<TabLoading kind="list" />}
      render={(m) => (
        <m.default
          projectId={projectId}
          http={axiosInstance}
          ai={ai}
          failed={(retry, part) => <ErrorState subject={part ?? "the releases"} compact={!!part} onRetry={retry} />}
          empty={(state) => <EmptyState icon={Rocket} {...state} />}
        />
      )}
    />
  )
}
