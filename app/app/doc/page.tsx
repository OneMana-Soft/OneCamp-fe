"use client";

import dynamic from "next/dynamic";

import { DocsHomeSkeleton } from "@/components/doc/docSkeletons";

// The docs home's code loads when the page is opened, not with the route: a
// doc's "Docs" crumb prefetches this route, and a doc's opening carried the
// whole docs home with it. The page's shape draws while it arrives.
const DocListTabs = dynamic(() => import("@/components/doc/docListTabs").then((m) => m.DocListTabs), {
    loading: () => <DocsHomeSkeleton />,
});

export default function DocsPage() {
    return <DocListTabs />;
}
