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

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  
  return (
    <ClientProviders>
      <GlobalErrorBoundary>
        <AppProtectedRoute>
          <LayoutContent>
              {children}
          </LayoutContent>
          <UnifiedUIManager />
          <CommandPaletteLoader />
          <FCMHandler />
          <DocumentTitle />
        </AppProtectedRoute>
      </GlobalErrorBoundary>
    </ClientProviders>
  );
}