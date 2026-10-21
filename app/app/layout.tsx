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
import dynamic from "next/dynamic";

// Every composer's draft, kept beyond the tab (lib/conversation/draftSync): in
// a chunk of its own, so no route's first load carries it.
const DraftSyncLoader = dynamic(() => import("@/components/conversation/DraftSyncLoader").then((m) => m.DraftSyncLoader), { ssr: false });

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  
  return (
    <ClientProviders>
      {/* Marks the signed-in app, so globals.css locks the page for it alone. */}
      <span data-app-shell hidden />
      <GlobalErrorBoundary>
        <AppProtectedRoute>
          <LayoutContent>
              {children}
          </LayoutContent>
          <UnifiedUIManager />
          <CommandPaletteLoader />
          <FCMHandler />
          <DraftSyncLoader />
          {/* It reads the address's ?tab=, which a prerender can't know. */}
          <Suspense fallback={null}>
            <DocumentTitle />
          </Suspense>
          <FaviconBadge />
        </AppProtectedRoute>
        {/* The one polite live region (lib/ui/announce). */}
        <LiveRegion />
      </GlobalErrorBoundary>
    </ClientProviders>
  );
}