"use client";

import { use } from "react";
import { getGuestTable } from "@/services/guestService";
import { GuestTableViewer } from "@/components/guest/GuestTableViewer";
import { GuestNotYet, useGuestAnswer } from "@/components/guest/guestUi";
import { PublicGone } from "@/components/guest/publicStates";
import { Eye } from "@/lib/icons";
import { PaperCard, PublicFrame } from "@/components/guest/PublicFrame";
import { TableGlyph } from "@/components/table/TableGlyph";
import { formatLocale } from "@/lib/tables/numberFormat";

const gone = <PublicGone surface="guest-table" noun="shared table" detail="The link may have expired or been turned off. Ask the person who shared it for a new one." />;

/**
 * A table shared with someone outside the workspace (content.md T21): the
 * finished public page (band, mark, half-strength glow, credit) with the
 * table on a paper card, read only, in the grid's own look.
 */
export default function GuestTablePage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params);

    // Retried while the server is busy or out of reach; a dead link stops it.
    const { data: bundle, trouble } = useGuestAnswer(`table:${token}`, () => getGuestTable(token));

    if (!bundle) {
        return <GuestNotYet trouble={trouble} gone={gone} shape="table" label="Opening the shared table…" />;
    }
    if (!bundle.table || !Array.isArray(bundle.fields)) return gone;

    const name = bundle.table?.name || "Shared table";
    const rows = bundle.rows || [];
    // A share carries the first rows; the count is every row.
    const total = bundle.row_count ?? rows.length;
    return (
        <PublicFrame
            surface="guest-table"
            workspaceName={bundle.workspace_name}
            // The page's heading; a long name truncates rather than pushing the tag off the bar.
            title={<span title={name}>{name}</span>}
            actions={
                <span className="chip h-6 gap-1 text-ink-2">
                    <Eye className="size-3" aria-hidden="true" /> Read only
                </span>
            }
            mainClassName="px-0 pt-2 sm:px-6 sm:pt-6"
        >
            <PaperCard className="max-w-[1120px] overflow-hidden">
                <div className="flex items-start gap-3 px-5 pb-4 pt-6 sm:px-8 sm:pt-8">
                    <TableGlyph size="lg" icon={bundle.table?.icon} id={bundle.table?.id} />
                    <div className="min-w-0">
                        <p className="truncate font-display text-title-1 text-ink">{name}</p>
                        <p className="mt-0.5 text-ui text-ink-2">
                            {bundle.table?.description ? `${bundle.table.description} · ` : ""}
                            {formatLocale(total, {})} {total === 1 ? "row" : "rows"}
                        </p>
                    </div>
                </div>
                <GuestTableViewer fields={bundle.fields} rows={rows} total={total} />
            </PaperCard>
        </PublicFrame>
    );
}
