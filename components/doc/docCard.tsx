import React from 'react';
import Link from "next/link";
import { DocInfoInterface } from "@/types/doc";
import { DocPreview } from "@/components/doc/docPreview";
import { agoOrDate, fullDateTime } from "@/lib/utils/date/shortDate";
import { cn } from "@/lib/utils/helpers/cn";
import { Globe, Lock } from "@/lib/icons";
import { IdentityMark } from "@/components/ui/graphics/IdentityMark";
import { displayNameOf } from "@/lib/personName";

interface DocCardProps {
    doc: DocInfoInterface;
    /** Where the card leads. */
    href: string;
    className?: string;
    /** For the entrance stagger on the first load. */
    index?: number;
}

/** The member's shown name (the one rule, displayNameOf), first word only. */
function firstName(u?: { user_full_name?: string; user_name?: string } | null): string {
    return displayNameOf(u).split(/\s+/)[0] || ""
}

/**
 * A doc in the list (content.md D02): its first lines as a page on the
 * sunken ground, then the title (two lines, balanced) and who wrote it and
 * when, with a lock or a globe for who can open it. No border and no hue: a
 * doc has none, the colour comes from the person. A card on e1 that rises to
 * e2 under the pointer while its page lifts 2 px. On a phone it is a 64 px
 * row with a small page, since two cards at 175 px were unreadable.
 *
 * A link, so it opens from the keyboard and in a new tab, and is fetched ahead.
 */
export const DocCard: React.FC<DocCardProps> = ({ doc, href, className, index }) => {
    const displayDate = doc.doc_updated_at || doc.doc_created_at;
    let when = "";
    let whenFull = "";
    if (displayDate) {
        const d = new Date(displayDate);
        if (!isNaN(d.getTime())) {
            when = agoOrDate(d);
            whenFull = fullDateTime(d);
        }
    }
    const title = doc.doc_title || "Untitled";
    const author = doc.doc_created_by;
    const who = firstName(author);
    const isPrivate = !!doc.doc_private;
    const Access = isPrivate ? Lock : Globe;

    return (
        <Link
            href={href}
            data-doc-card=""
            aria-label={[title, when && `edited ${when}`, isPrivate ? "private" : "shared"].filter(Boolean).join(", ")}
            style={index !== undefined ? ({ "--i": index } as React.CSSProperties) : undefined}
            className={cn(
                "group relative flex overflow-hidden bg-raised text-ink outline-none",
                "transition-[translate,box-shadow] duration-[140ms] ease-[var(--ease-out)]",
                "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-sheet",
                // Phone: a row.
                "max-sm:h-16 max-sm:items-center max-sm:gap-3 max-sm:rounded-lg max-sm:bg-transparent max-sm:px-1 max-sm:active:bg-press",
                // From sm: the card.
                "sm:h-[264px] sm:flex-col sm:rounded-xl sm:shadow-e1 sm:hover:-translate-y-px sm:hover:shadow-e2 sm:active:translate-y-0 sm:active:shadow-e1 motion-reduce:hover:translate-y-0",
                index !== undefined && "content-rise",
                className
            )}
        >
            {/* The page */}
            <div className="relative shrink-0 overflow-hidden max-sm:h-[52px] max-sm:w-10 max-sm:rounded-md sm:h-44">
                <div className="h-full max-sm:hidden">
                    <DocPreview content={doc.doc_snippet || doc.doc_body} title={doc.doc_title} />
                </div>
                <div className="h-full sm:hidden">
                    <DocPreview content="" compact />
                </div>
            </div>

            {/* The title, who and when */}
            <div className="flex min-w-0 flex-1 flex-col sm:justify-between sm:px-3.5 sm:pb-3 sm:pt-3">
                <h3
                    className="truncate text-body font-medium leading-5 text-ink sm:line-clamp-2 sm:whitespace-normal sm:text-ui sm:[text-wrap:balance]"
                    title={title}
                >
                    {title}
                </h3>
                <div className="mt-0.5 flex items-center gap-1.5 text-meta text-ink-3 sm:mt-0">
                    {author?.user_uuid ? (
                        <IdentityMark
                            id={author.user_uuid}
                            variant="avatar"
                            size={20}
                            label={displayNameOf(author)}
                            className="max-sm:hidden"
                        />
                    ) : null}
                    <span className="min-w-0 truncate tabular-nums" title={whenFull || undefined}>
                        {who ? <span className="max-sm:hidden">{who} · </span> : null}
                        {when}
                    </span>
                    <Access className="ml-auto size-3.5 shrink-0 text-ink-3 max-sm:hidden" aria-hidden="true" />
                </div>
            </div>
        </Link>
    );
};
