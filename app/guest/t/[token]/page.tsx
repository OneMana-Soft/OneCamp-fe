"use client";

import { use } from "react";
import { getGuestTable } from "@/services/guestService";
import { GuestTableViewer } from "@/components/guest/GuestTableViewer";
import { GuestCentered, GuestLinkGone, GuestNotYet, useGuestAnswer } from "@/components/guest/guestUi";
import { Loader2, Table as TableIcon, Eye } from "@/lib/icons";
import { MadeWithOneCamp } from "@/components/public/MadeWithOneCamp"

const gone = <GuestLinkGone detail="The share link may have expired or been revoked. Ask the person who shared it for a new link." />;

export default function GuestTablePage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params);

    // Retried while the server is busy or out of reach; a dead link stops it.
    const { data: bundle, trouble } = useGuestAnswer(`table:${token}`, () => getGuestTable(token));

    if (!bundle) {
        return (
            <GuestNotYet
                trouble={trouble}
                gone={gone}
                loading={
                    <GuestCentered>
                        <Loader2 className="h-7 w-7 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">Opening the shared table…</p>
                    </GuestCentered>
                }
            />
        );
    }
    if (!bundle.table || !Array.isArray(bundle.fields)) return gone;

    return (
        <div className="min-h-dvh w-full bg-background">
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-card px-4 py-2.5">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <TableIcon className="h-3.5 w-3.5" />
                    </span>
                    {bundle.table?.name || "Shared table"}
                </div>
                <div className="flex items-center gap-3">
                    <MadeWithOneCamp surface="guest-table" className="hidden sm:block" />
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground">
                        <Eye className="h-3 w-3" /> Read only
                    </span>
                </div>
            </header>
            <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
                <GuestTableViewer fields={bundle.fields} rows={bundle.rows} />
            </main>
        </div>
    );
}
