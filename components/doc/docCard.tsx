import React from 'react';
import { LevelMark } from "@/components/doc/LevelMark"
import { levelLabel } from "@/lib/docs/abilities"
import { DocPreview } from "@/components/doc/docPreview";
import { cn } from "@/lib/utils/helpers/cn";
import { Globe, Lock } from "@/lib/icons";
import { IdentityMark } from "@/components/ui/graphics/IdentityMark";
import { avatarSeed } from "@/lib/utils/getAvatarColor";
import { displayNameOf, firstNameOf } from "@/lib/personName";
import { NodeLink } from "@/components/docFiles/NodeLink";
import { IntentLink } from "@/components/navigationBar/desktop/IntentLink";
import { DocRowMenu } from "@/components/docTree/DocRowMenu";
import { DocIcon } from "@/components/docEditor/DocIcon";
import { ColourDot, NodeMark, markOfListItem, nodeHue } from "@/components/docFiles/NodeMark";
import { seedNodeInfo } from "@/components/docFiles/fileActions";
import { useNodeDialogs, warmFilePreview } from "@/components/docFiles/useNodeDialogs";
import { checkLinkUrl, kindWord, openingOf } from "@/lib/docs/docNode";
import { rememberDocIcon } from "@/lib/docLook";
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

/**
 * A doc in the list (content.md D02): its first lines as a page on a ground
 * in the doc's own hue, then the title (two lines, balanced) and who owns it
 * and when it changed, with a lock or a globe for who can open it. No border.
 * The hue is the doc's (INTERACTION_SPEC D13, lib/docLook docHue: its glyph's
 * colour, else its id's): the docs home was rows of identical grey cards (0%
 * colour, PG2-09). A card on e1 that rises to e2 under the pointer while its
 * page lifts 2 px; its "⋯" (star, duplicate, the trash) shows on hover and
 * focus. On a phone it is a 64 px row with the doc's icon on a 40 px tile in
 * its hue, since two cards at 175 px were unreadable (a page drawn that small
 * was a blank white box).
 *
 * A link, so it opens from the keyboard and in a new tab, and the doc is
 * fetched ahead on intent (A2's prefetch, through IntentLink).
 *
 * Docs & Files (docs F1b): a folder's, a file's or a link's card shows its
 * mark where a page shows its first lines, and opens its own way (a folder
 * at its address, a file's preview in place, a link's document in a new
 * tab); a colour shows as a dot after a page's, a file's or a link's title.
 */
export const DocCard: React.FC<DocCardProps> = ({ doc, href, className, index, when = "edited", canEdit = false }) => {
    const time = whenOf(doc, when);
    const title = titleOf(doc.doc_title);
    const owner = doc.owner;
    const who = firstNameOf(displayNameOf(owner));
    const isPrivate = !!doc.doc_private;
    const Access = isPrivate ? Lock : Globe;
    const where = pathLabel(doc.path);
    const kind = doc.doc_node_kind;
    const mark = markOfListItem(doc);
    const hue = nodeHue(mark);
    const opening = openingOf(kind);
    const link = opening === "external" ? checkLinkUrl(doc.doc_link_url ?? "") : null;
    const external = link?.ok ? link.url : null;
    const dialogs = useNodeDialogs();
    const preview = (versions = false) => dialogs.open({ kind: "preview", file: { id: doc.doc_uuid, title: doc.doc_title ?? "", facts: doc.doc_file, canEdit }, versions });
    // A page fetches its route and live copy on intent (IntentLink); a
    // folder, a file or a link its route only (NodeLink): none on sight. A
    // file's preview comes on the same intent.
    const Anchor = kind ? NodeLink : IntentLink;
    const warm = opening === "preview" ? warmFilePreview : undefined;
    // Its icon, for the lists that name a doc without it (lib/docLook).
    rememberDocIcon(doc.doc_uuid, doc.doc_icon);

    return (
        <div className={cn("group/card relative", className)}>
            <Anchor
                href={external ?? href}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                onPointerEnter={warm}
                onFocus={warm}
                onTouchStart={warm}
                onClick={(e: React.MouseEvent) => {
                    const plain = !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0;
                    if (opening === "preview" && plain) {
                        e.preventDefault();
                        preview();
                    } else if (opening === "folder") {
                        seedNodeInfo({ kind: "doc", uuid: doc.doc_uuid, title: doc.doc_title, has_children: false, node_kind: kind, color: doc.doc_color, private: doc.doc_private });
                    }
                }}
                data-doc-card=""
                data-hue={hue ?? undefined}
                aria-label={[title, kind && kindWord(kind), where && `in ${where}`, time.short && `${when === "viewed" ? "opened" : "edited"} ${time.short}`, isPrivate ? "private" : "shared", levelLabel("level" in doc ? doc.level : undefined).toLowerCase()].filter(Boolean).join(", ")}
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
                <div className={cn("relative shrink-0 overflow-hidden max-sm:flex max-sm:size-10 max-sm:items-center max-sm:justify-center max-sm:rounded-lg sm:h-44", hue ? "max-sm:bg-hue-tint" : "max-sm:bg-sunken")}>
                    <div className="h-full max-sm:hidden">
                        {kind ? (
                            // A folder's, a file's or a link's mark, large, on its hue's ground.
                            <div className={cn("flex h-full items-center justify-center", hue ? "bg-hue-tint/60" : "bg-sunken")}>
                                <NodeMark node={mark} size={40} className="transition-transform duration-[160ms] ease-[var(--ease-out)] group-hover:-translate-y-0.5" />
                            </div>
                        ) : (
                            <DocPreview content={doc.doc_snippet || ""} title={doc.doc_title} icon={<DocIcon icon={doc.doc_icon} id={doc.doc_uuid} size={40} />} tinted={!!hue} />
                        )}
                    </div>
                    <NodeMark node={mark} size={20} className="sm:hidden" />
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
                        {doc.doc_color && kind !== "folder" ? <ColourDot hue={doc.doc_color} className="ml-1.5 align-middle" /> : null}
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
            </Anchor>
            <span className="absolute right-2 top-2 flex rounded-md max-sm:top-1/2 max-sm:-translate-y-1/2 sm:bg-raised sm:opacity-0 sm:shadow-e1 sm:group-hover/card:opacity-100 sm:group-focus-within/card:opacity-100 [@media(hover:none)]:opacity-100">
                <DocRowMenu
                    doc={{ id: doc.doc_uuid, title: doc.doc_title ?? "", icon: doc.doc_icon }}
                    canEdit={canEdit}
                    node={{ kind, color: doc.doc_color, linkUrl: doc.doc_link_url, file: doc.doc_file }}
                    act={{
                        preview: kind === "file" ? () => preview() : undefined,
                        versions: kind === "file" ? () => preview(true) : undefined,
                        replace: kind === "file" ? () => dialogs.open({ kind: "replace", file: { id: doc.doc_uuid, title: doc.doc_title ?? "" } }) : undefined,
                        colourSheet: () => dialogs.open({ kind: "colour", ids: [doc.doc_uuid], current: doc.doc_color, title: doc.doc_title }),
                    }}
                    focusable
                    className="size-7 sm:size-6"
                />
            </span>
            {dialogs.element}
        </div>
    );
};
