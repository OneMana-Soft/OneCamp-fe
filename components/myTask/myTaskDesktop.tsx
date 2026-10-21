"use client"

import { Tabs } from "@/components/ui/tabs"
import { WorkSegmented } from "@/components/task/WorkToolbar"
import { CountTick } from "@/components/ui/CountTick"
import { whenOf } from "@/lib/tasks/grouping"
import { cn } from "@/lib/utils/helpers/cn"
import { useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import type { TaskInfoInterface } from "@/types/task"
import { List } from "@/lib/icons";
import { Kanban } from "@/lib/icons";
import { MyTaskTable } from "@/components/myTask/myTaskTable"
import dynamic from "next/dynamic"
import { BoardSkeleton } from "@/components/kanbanComponents/BoardSkeleton"
import { useSearchParams } from "next/navigation"
import { useState, useEffect, useCallback, useMemo, startTransition } from "react"
import { KeptTab, useSeenTabs, useTabInAddress } from "@/components/task/keptTabs"
import {useTranslation} from "react-i18next";

// The board is its own chunk, fetched when its tab first opens, as on a project.
const MyTaskKanban = dynamic(() => import("@/components/myTask/myTaskKanban").then((m) => m.MyTaskKanban), { loading: () => <BoardSkeleton /> })

const VALID_TABS = ["list", "kanban"] as const
type TabValue = (typeof VALID_TABS)[number]

export const MyTaskDesktop = () => {
    const searchParams = useSearchParams()
    const {t} = useTranslation()

    // Initialize tab state from URL with validation
    const [selectedTab, setSelectedTab] = useState<TabValue>(() => {
        const tabFromUrl = searchParams.get("tab")
        return VALID_TABS.includes(tabFromUrl as TabValue) ? (tabFromUrl as TabValue) : "list"
    })

    const seen = useSeenTabs(selectedTab)
    const tabInAddress = useTabInAddress()

    // The underline moves at once; the list or board follows as a transition.
    const handleTabChange = useCallback((value: string) => {
        if (VALID_TABS.includes(value as TabValue)) {
            startTransition(() => setSelectedTab(value as TabValue))
        }
    }, [])

    useEffect(() => tabInAddress("tab", selectedTab), [selectedTab, tabInAddress])

    return (
        <div className="flex h-full flex-col overflow-hidden">
            {/* The header (work.md W14): the title, your day in counts, and the layout. */}
            <header className="flex h-[52px] shrink-0 items-center gap-4 px-6 pt-2">
                <h1 className="text-title-1 font-[590] tracking-[-0.019em] text-foreground">{t("myTasks")}</h1>
                <MyDayCounts />
                <span className="flex-1" />
                <WorkSegmented
                    label="Layout"
                    value={selectedTab}
                    onChange={handleTabChange}
                    className="w-40"
                    options={[
                        { value: "list", label: t("list"), icon: <List className="size-3.5" /> },
                        { value: "kanban", label: t("board"), icon: <Kanban className="size-3.5" /> },
                    ]}
                />
            </header>

            <Tabs value={selectedTab} onValueChange={handleTabChange} className="flex min-h-0 flex-1 flex-col gap-0">
                {/* One scroll container for both bodies. */}
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <KeptTab value="list" selected={selectedTab === "list"} seen={seen.has("list")} className="mt-0 h-full data-[state=active]:[animation:work-fade-in_120ms_var(--ease-out)]">
                        <MyTaskTable onLayout={(l) => handleTabChange(l)} />
                    </KeptTab>
                    <KeptTab value="kanban" selected={selectedTab === "kanban"} seen={seen.has("kanban")} className="mt-0 h-full data-[state=active]:[animation:work-fade-in_120ms_var(--ease-out)]">
                        <MyTaskKanban className="px-5 pt-3" />
                    </KeptTab>
                </div>
            </Tabs>
        </div>
    )
}

/**
 * Your day in counts beside the title: "3 today · 1 overdue · 7 this week",
 * the numbers at 510 and ticking as they change. Read from the list on
 * screen, so it moves the moment a task is finished or dated.
 */
function MyDayCounts() {
    const tasks = useSelector((s: RootState) => s.TaskInfo.taskListVisibleInfo || NONE)
    const counts = useMemo(() => {
        const c = { today: 0, overdue: 0, week: 0 }
        const now = new Date()
        for (const task of tasks) {
            const w = whenOf(task, now)
            if (w === "today") c.today++
            else if (w === "overdue") c.overdue++
            if (w === "today" || w === "week") c.week++
        }
        return c
    }, [tasks])
    if (tasks.length === 0) return null
    const parts = [
        { n: counts.today, word: "today" },
        ...(counts.overdue > 0 ? [{ n: counts.overdue, word: "overdue", late: true }] : []),
        { n: counts.week, word: "this week" },
    ]
    return (
        <p className="flex items-center gap-[10px] text-ui-sm text-ink-2">
            {parts.map((p, i) => (
                <span key={p.word} className="inline-flex items-center gap-[10px]">
                    {i > 0 && <span aria-hidden="true" className="text-ink-4">·</span>}
                    <span className={cn(p.late && "text-danger-ink")}>
                        <CountTick value={p.n} className={cn("font-[510]", p.late ? "text-danger-ink" : "text-foreground")} /> {p.word}
                    </span>
                </span>
            ))}
        </p>
    )
}
const NONE: TaskInfoInterface[] = []
