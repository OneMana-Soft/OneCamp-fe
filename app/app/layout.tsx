"use client"

import { AppProtectedRoute } from "@/components/protectedRoute/appProtectedRoute";
import { DesktopNavigationBar } from "@/components/navigationBar/desktop/desktopNavigationBar";
import { MobileNavigationBar } from "@/components/navigationBar/mobile/mobileNavigationBar";
import { RightPanel } from "@/components/rightPanel/rightPanel";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils/helpers/cn";
import ClientProviders from "./ClientProviders";
import { UnifiedUIManager } from "@/components/ui/UnifiedUIManager";
import { CommandPaletteLoader } from "@/components/ui/CommandPaletteLoader";
import { LayoutContent } from "./LayoutContent";
import { GlobalErrorBoundary } from "@/components/error/GlobalErrorBoundary";
import "@/lib/env"; // Validate environment variables early
import { FCMHandler } from "@/components/fcm/FCMHandler";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  
  return (
    <ClientProviders>
      {/*<GlobalErrorBoundary>*/}
        <AppProtectedRoute>
          <LayoutContent>
              {children}
          </LayoutContent>
          <UnifiedUIManager />
          <CommandPaletteLoader />
          <FCMHandler />
        </AppProtectedRoute>
      {/*</GlobalErrorBoundary>*/}
    </ClientProviders>
  );
}