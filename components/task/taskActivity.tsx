import { displayNameOf } from "@/lib/personName"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { taskActivityConst } from "@/types/taskActivity"
import type { TaskActivityInterface } from "@/types/task"
import { useTranslation } from "react-i18next"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { AgentAvatar } from "@/components/ui/graphics/PrincipalAvatar"
import { StatusGlyph } from "@/components/ui/graphics/glyphs"
import { BUILT_IN_STATUSES, CATEGORY_KIND, isBuiltInStatus } from "@/lib/taskStatus"
import { changedList, shortAgo, type HistoryLine } from "@/lib/tasks/activityStream"
import { fullDateTime } from "@/lib/utils/date/shortDate"
import { BotTag } from "@/components/ui/botTag"

interface TaskActivityProps {
    taskActivity: TaskActivityInterface
    /** The changes folded into this line, when there is more than one (W32). */
    line?: HistoryLine
    openOtherUserProfile: (id: string) => void
}

/**
 * One line of a task's history (design v3, work.md W32): a 20px avatar (an
 * agent's square for an agent, with its Agent tag), the actor in 510 ink and
 * the change in 13px ink-2 with its glyph inline ("moved this to ◑ In
 * progress"), then the time in ink-3. A burst of one person's changes reads
 * as one line: "Sam changed status, priority and due date".
 */
export default function TaskActivity({ taskActivity, line, openOtherUserProfile }: TaskActivityProps) {
    const { src: imageSrc } = useUserAvatar(taskActivity.activity_by.user_profile_object_key)
    const { t } = useTranslation()
    const by = taskActivity.activity_by
    const name = displayNameOf(by) || ""
    const agent = !!by?.is_bot

    // A kind of change this build doesn't know (a newer server's) is left
    // out rather than taking the whole history down with it.
    const phrase = taskActivityConst[taskActivity.activity_type]?.key
    if (!phrase) return null

    const folded = !!line && line.changes.length > 1
    const status = taskActivity.activity_type === "statusUpdate" && isBuiltInStatus(taskActivity.activity_next_state) ? taskActivity.activity_next_state : null

    return (
        <div className="flex items-start gap-2 py-1 text-ui-sm" data-history-line={folded ? "folded" : "single"}>
            <span className="mt-px size-5 shrink-0">
                {agent ? <AgentAvatar src={imageSrc} /> : <IdentityMark variant="avatar" id={by?.user_uuid} label={name} src={imageSrc} size={20} />}
            </span>
            <p className="min-w-0 flex-1 text-ink-2">
                <button type="button" className="font-[510] text-foreground hover:underline" onClick={() => openOtherUserProfile(by.user_uuid)}>
                    {name}
                </button>
                {agent && <BotTag userUUID={by.user_uuid} className="ml-1.5 align-[1px]" />}{" "}
                {folded && line ? (
                    <>changed {changedList(line)}</>
                ) : status ? (
                    <>
                        moved this to{" "}
                        <span className="inline-flex translate-y-[3px] items-center gap-1 text-foreground">
                            <StatusGlyph status={CATEGORY_KIND[status]} size={14} />
                            {t(status, { defaultValue: BUILT_IN_STATUSES.find((s) => s.value === status)?.label })}
                        </span>
                    </>
                ) : (
                    // After the name, mid-sentence: "Sam Rivera updated the
                    // description", not "Sam Rivera Updated...".
                    <>{lowerFirst(t(phrase, { field: taskActivity.activity_next_state }))}.</>
                )}{" "}
                <time className="text-ink-3" dateTime={taskActivity.activity_time} title={taskActivity.activity_time ? fullDateTime(new Date(taskActivity.activity_time)) : undefined}>
                    · {shortAgo(taskActivity.activity_time)}
                </time>
            </p>
        </div>
    )
}

/** The phrase's first letter in lower case, where it follows a name; a field's own name keeps its case. */
function lowerFirst(s: string) {
    return s ? s.charAt(0).toLowerCase() + s.slice(1) : s
}
