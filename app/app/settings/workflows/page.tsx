"use client"

import WorkflowsCard from "@/components/admin/WorkflowsCard"
import { useCapabilities } from "@/hooks/useCapabilities"
import { CAP_WORKFLOW_MANAGE } from "@/services/capabilityService"
import { Loader2, Zap } from "@/lib/icons"

export default function WorkflowsSettingsPage() {
    const { can, isLoading } = useCapabilities()

    if (isLoading) {
        return (
            <div className="container mx-auto flex items-center justify-center px-4 py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
            </div>
        )
    }

    if (!can(CAP_WORKFLOW_MANAGE)) {
        return (
            <div className="container mx-auto max-w-3xl px-4 py-16">
                <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/60 px-6 py-12 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                        <Zap className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm font-medium">Workflows aren&apos;t available for you</p>
                        <p className="max-w-sm text-sm text-muted-foreground">
                            A workspace admin can enable member-created workflows in Settings →
                            Permissions.
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="container mx-auto max-w-3xl px-4 py-8">
            <WorkflowsCard />
        </div>
    )
}
