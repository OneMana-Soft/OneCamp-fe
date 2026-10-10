import React from 'react';
import Link from "next/link";
import { DocInfoInterface } from "@/types/doc";
import { DocPreview } from "@/components/doc/docPreview";
import { shortDate } from "@/lib/utils/date/shortDate";
import { cn } from "@/lib/utils/helpers/cn";
import { FileText } from "@/lib/icons";
import { IdentityMark } from "@/components/ui/graphics/IdentityMark";

interface DocCardProps {
    doc: DocInfoInterface;
    /** Where the card leads. */
    href: string;
    className?: string;
}

/**
 * A doc in the list: its first lines as a page, then its name beside its
 * identity mark (a page in the doc's own hue, the colour it has in the
 * sidebar too) and when it last changed. A link, so it opens from the
 * keyboard, in a new tab with a modifier, and its page is fetched ahead.
 */
export const DocCard: React.FC<DocCardProps> = ({ doc, href, className }) => {
    const displayDate = doc.doc_updated_at || doc.doc_created_at;
    let dateStr = "";
    if (displayDate) {
        const d = new Date(displayDate);
        if (!isNaN(d.getTime())) dateStr = shortDate(d);
    }

    return (
        <Link
            href={href}
            className={cn(
                "group relative flex h-64 flex-col overflow-hidden rounded-lg border border-border bg-card hover-lift md:h-72",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                className
            )}
        >
            {/* The page */}
            <div className="relative flex-1 overflow-hidden border-b border-border bg-muted/30">
                <DocPreview content={doc.doc_snippet || doc.doc_body} className="h-full w-full" />
            </div>

            {/* Its name, its mark, and when it changed */}
            <div className="flex h-16 items-center gap-2.5 px-3">
                <IdentityMark id={doc.doc_uuid} variant="tile" size={24} icon={<FileText />} />
                <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium text-card-foreground" title={doc.doc_title}>
                        {doc.doc_title || "Untitled"}
                    </h3>
                    {dateStr && <span className="block truncate text-xs tabular-nums text-muted-foreground">{dateStr}</span>}
                </div>
            </div>
        </Link>
    );
};
