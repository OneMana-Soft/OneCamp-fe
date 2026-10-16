import React from 'react';
import { LevelMark } from "@/components/doc/LevelMark"
import { levelLabel } from "@/lib/docs/abilities"
import { DocPreview } from "@/components/doc/docPreview";
import { cn } from "@/lib/utils/helpers/cn";
import { Globe, Lock } from "@/lib/icons";
import { IdentityMark } from "@/components/ui/graphics/IdentityMark";
import { avatarSeed } from "@/lib/utils/getAvatarColor";
import { displayNameOf } from "@/lib/personName";
import { IntentLink } from "@/components/navigationBar/desktop/IntentLink";
import { DocRowMenu } from "@/components/docTree/DocRowMenu";
import { DocIcon } from "@/components/docEditor/DocIcon";
import { pathLabel, titleOf, whenOf } from "@/components/doc/docRows";
import type { DocListItem } from "@/types/docGraph";

interface DocCardProps {
    doc: DocListItem;
    /** Where the card leads. */
    href: string;
    className?: string;
    /** For the entrance stagger on the first load. */
    index?: number;
    /** "viewed" on Recent: when the viewer last opened it. */
    when?: "edited" | "viewed";
    /** The viewer may change it: its menu offers Rename and the trash. A list doesn't say, so only its owner is sure. */
    canEdit?: boolean;
}

/** The member's shown name (the one rule, displayNameOf), first word only. */
function firstName(u?: { user_full_name?: string; user_name?: string } | null): string {
    return displayNameOf(u).split(/\s+/)[0] || ""
}

/**
 * A doc in the list (content.md D02): its first lines as a page on the
 * sunken ground, then the title (two lines, balanced) and who owns it and
 * when it changed, with a lock or a globe for who can open it. No border and
 * no hue: a doc has none, the colour comes from the person. A card on e1 that
 * rises to e2 under the pointer while its page lifts 2 px; its "⋯" (star,
 * duplicate, the trash) shows on hover and focus. On a phone it is a 64 px
 * row with the doc's icon on a 40 px tile, since two cards at 175 px were
 * unreadable (a page drawn that small was a blank white box).
 *
 * A link, so it opens from the keyboard and in a new tab, and the doc is
 * fetched ahead on intent (A2's prefetch, through IntentLink).
 */
export const DocCard: React.FC<DocCardProps> = ({ doc, href, className, index, when = "edited", canEdit = false }) => {
    const time = whenOf(doc, when);
    const title = titleOf(doc.doc_title);
    const owner = doc.owner;
    const who = firstName(owner);
    const isPrivate = !!doc.doc_private;
    const Access = isPrivate ? Lock : Globe;
    const where = pathLabel(doc.path);

    return (
        <div className={cn("group/card relative", className)}>
            <IntentLink
                href={href}
                data-doc-card=""
                aria-label={[title, where && `in ${where}`, time.short && `${when === "viewed" ? "opened" : "edited"} ${time.short}`, isPrivate ? "private" : "shared", levelLabel("level" in doc ? doc.level : undefined).toLowerCase()].filter(Boolean).join(", ")}
                style={index !== undefined ? ({ "--i": index } as React.CSSProperties) : undefined}
                className={cn(
                    "group relative flex overflow-hidden bg-raised text-ink outline-none",
                    "transition-[translate,box-shadow] duration-[140ms] ease-[var(--ease-out)]",
                    "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-sheet",
                    // Phone: a row.
                    "max-sm:h-16 max-sm:items-center max-sm:gap-3 max-sm:rounded-lg max-sm:bg-transparent max-sm:px-1 max-sm:pr-10 max-sm:active:bg-press",
                    // From sm: the card.
                    "sm:h-[264px] sm:flex-col sm:rounded-xl sm:shadow-e1 sm:hover:-translate-y-px sm:hover:shadow-e2 sm:active:translate-y-0 sm:active:shadow-e1 motion-reduce:hover:translate-y-0",
                    index !== undefined && "content-rise",
                )}
            >
                {/* The page; on a phone, the doc's icon */}
                <div className="relative shrink-0 overflow-hidden max-sm:flex max-sm:size-10 max-sm:items-center max-sm:justify-center max-sm:rounded-lg max-sm:bg-sunken sm:h-44">
                    <div className="h-full max-sm:hidden">
                        <DocPreview content={doc.doc_snippet || ""} title={doc.doc_title} />
                    </div>
                    <DocIcon icon={doc.doc_icon} size={20} className="sm:hidden" />
                </div>

                {/* The title, who and when */}
                <div className="flex min-w-0 flex-1 flex-col sm:justify-between sm:px-3.5 sm:pb-3 sm:pt-3">
                    <h3
                        className={cn(
                            "truncate text-body font-medium leading-5 sm:line-clamp-2 sm:whitespace-normal sm:text-ui sm:[text-wrap:balance]",
                            doc.doc_title?.trim() ? "text-ink" : "text-ink-3",
                        )}
                        title={title}
                    >
                        {title}
                    </h3>
                    <div className="mt-0.5 flex items-center gap-1.5 text-meta text-ink-3 sm:mt-0">
                        {owner?.user_uuid ? (
                            <IdentityMark
                                id={avatarSeed(owner)}
                                variant="avatar"
                                size={20}
                                label={displayNameOf(owner)}
                                className="max-sm:hidden"
                            />
                        ) : null}
                        <span className="min-w-0 truncate tabular-nums" title={time.full || undefined}>
                            {who ? <span className="max-sm:hidden">{who} · </span> : null}
                            {where ? <span className="sm:hidden">in {where} · </span> : null}
                            {time.short}
                        </span>
                        <LevelMark level={"level" in doc ? doc.level : undefined} className="ml-auto" />
                        <Access className={cn("size-3.5 shrink-0 text-ink-3 max-sm:hidden", !levelLabel("level" in doc ? doc.level : undefined) && "ml-auto")} aria-hidden="true" />
                    </div>
                </div>
            </IntentLink>
            <span className="absolute right-2 top-2 flex rounded-md max-sm:top-1/2 max-sm:-translate-y-1/2 sm:bg-raised sm:opacity-0 sm:shadow-e1 sm:group-hover/card:opacity-100 sm:group-focus-within/card:opacity-100 [@media(hover:none)]:opacity-100">
                <DocRowMenu doc={{ id: doc.doc_uuid, title: doc.doc_title ?? "", icon: doc.doc_icon }} canEdit={canEdit} focusable className="size-7 sm:size-6" />
            </span>
        </div>
    );
};
