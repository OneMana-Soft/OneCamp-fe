import { useTranslation } from "react-i18next";
import type { ComponentType } from "react";
import {cn} from "@/lib/utils/helpers/cn";
import { isBuiltInStatus } from "@/lib/taskStatus";

/** What a status needs to be shown: a built-in status, or a project's own. */
interface StatusLike {
    value: string
    label: string
    color: string
    /** The dot's colour class; a status without one reads in the neutral grey. */
    dot?: string
    icon?: ComponentType<{ className?: string }>
}

/**
 * A status as a 6px dot in its colour and the name in plain text.
 *
 * It was a tinted pill with an icon inside, and so was the priority beside it,
 * the custom field beside that and the avatar after: one task row carried up to
 * five coloured shapes. The dot keeps the colour's information at a fraction of
 * the ink, and the word carries the meaning on its own.
 */
export const TaskStatusCell = ({status, className}: {status: StatusLike; className?: string}) => {
    // The label, in the reader's language; never the stored value such as
    // inReview. A project's own status is shown as its admins named it.
    const { t } = useTranslation()
    const label = isBuiltInStatus(status.value) ? t(status.value, { defaultValue: status.label }) : status.label

    return (
        <span
            className={cn(
                // Never two lines: a narrow column truncates the row, not the status.
                "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm text-foreground",
                className,
            )}
        >
            <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", status.dot ?? "bg-muted-foreground")} />
            <span>{label}</span>
        </span>
    )
}
