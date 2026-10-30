"use client"

import { AppProtectedRoute } from "@/components/protectedRoute/appProtectedRoute";
import ClientProviders from "./ClientProviders";
import { UnifiedUIManager } from "@/components/ui/UnifiedUIManager";
import { CommandPaletteLoader } from "@/components/ui/CommandPaletteLoader";
import { LayoutContent } from "./LayoutContent";
import { GlobalErrorBoundary } from "@/components/error/GlobalErrorBoundary";
import "@/lib/env"; // Validate environment variables early
import { FCMHandler } from "@/components/fcm/FCMHandler";
import { DocumentTitle } from "@/components/common/DocumentTitle";
import { LiveRegion } from "@/lib/ui/announce";
import { Suspense } from "react";
import { FaviconBadge } from "@/components/common/FaviconBadge";
import { AppShellMark } from "./AppShellMark";
import { PageVisits } from "@/hooks/useTrackPageVisit";
import dynamic from "next/dynamic";

// Every composer's draft, kept beyond the tab (lib/conversation/draftSync): in
// a chunk of its own, so no route's first load carries it.
const DraftSyncLoader = dynamic(() => import("@/components/conversation/DraftSyncLoader").then((m) => m.DraftSyncLoader), { ssr: false });
// The Offline Store (lib/offline, projects P7-1): tasks read stay readable
// offline, and changes made offline are sent when the network is back. In a
// chunk of its own, after the page.
const OfflineLoader = dynamic(() => import("@/components/offline/OfflineLoader").then((m) => m.OfflineLoader), { ssr: false });
import { AccountClock } from "@/components/common/AccountClock";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  
  return (
    <ClientProviders>
      {/* Marks <html> for the signed-in app, so globals.css locks the page for it alone. */}
      <AppShellMark />
      <GlobalErrorBoundary>
        <AppProtectedRoute>
          <LayoutContent>
              {children}
          </LayoutContent>
          <UnifiedUIManager />
          {/* Each page visited, for Recent: here, as the palette mounts on its first use. */}
          <PageVisits />
          <CommandPaletteLoader />
          <FCMHandler />
          <DraftSyncLoader />
          <OfflineLoader />
          {/* It reads the address's ?tab=, which a prerender can't know. */}
          <Suspense fallback={null}>
            <DocumentTitle />
          </Suspense>
          <FaviconBadge />
          <AccountClock />
        </AppProtectedRoute>
        {/* The one polite live region (lib/ui/announce). */}
        <LiveRegion />
      </GlobalErrorBoundary>
    </ClientProviders>
  );
}