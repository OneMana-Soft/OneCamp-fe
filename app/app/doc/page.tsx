"use client";

import * as React from "react";

import { DocsHomeSkeleton } from "@/components/doc/docSkeletons";
import { ErrorState } from "@/components/ui/error-state";
import { lazyPiece } from "@/lib/lazy/lazyPiece";

// The docs home's code loads when the page is opened, not with the route: a
// doc's "Docs" crumb prefetches this route, and a doc's opening carried the
// whole docs home with it. The page's shape draws while it arrives. When its
// code can't come (no network), the page says so in its place: Try again,
// 'online' or the next visit asks again (lib/lazy lazyPiece).
const DocListTabs = lazyPiece(() => import("@/components/doc/docListTabs").then((m) => ({ default: m.DocListTabs })), {
    failed: ({ retry }) => <ErrorState subject="your docs" detail="Check your connection, then try again." onRetry={retry} />,
});

export default function DocsPage() {
    return (
        <React.Suspense fallback={<DocsHomeSkeleton />}>
            <DocListTabs />
        </React.Suspense>
    );
}
