"use client"

import { TooltipProvider } from "@/components/ui/tooltip";
import { MqttProvider } from "@/components/mqtt/mqttProvider";
import { Toaster } from "@/components/ui/toaster";
import { MediaQueryProvider } from "@/context/MediaQueryContext";
import { LoadingProvider } from "@/context/LoadingContext";
import "@/lib/env"; // Trigger validation on load
// Initialise i18next on the client. Side-effect import ONLY: the module
// runs i18n.use(initReactI18next).init({...}) at evaluation time. Without
// this, every t("myTasks") call returns the literal key (e.g. "myTasks")
// because no resources / language are registered with the i18n
// instance. This must be a "use client" tree because i18next runs in
// the browser.
import "@/lib/utils/i18n";

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MediaQueryProvider>
      <LoadingProvider>
        <TooltipProvider delayDuration={200}>
          <MqttProvider>
            {children}
            <Toaster />
          </MqttProvider>
        </TooltipProvider>
      </LoadingProvider>
    </MediaQueryProvider>
  );
}
