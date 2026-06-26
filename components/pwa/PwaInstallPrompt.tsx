"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import { X, Share, MoreVertical } from "@/lib/icons";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";

export function PwaInstallPrompt() {
  const { toast } = useToast();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isPromptVisible, setIsPromptVisible] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    let promptFired = false;
    let installCheckTimeout: NodeJS.Timeout;

    // Listen for the beforeinstallprompt event fired by supported browsers (e.g. Chrome)
    const handleBeforeInstallPrompt = (e: any) => {
      const userAgent = window.navigator.userAgent.toLowerCase();
      const mobile = /iphone|ipad|ipod|android/.test(userAgent);
      
      // Explicitly ignore the install prompt intent on desktop devices
      if (!mobile) {
        return;
      }

      promptFired = true;
      clearTimeout(installCheckTimeout);
      
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      setIsInstalled(false);
      // Ensure UI is visible
      setIsPromptVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Determine if the user is on a mobile device and not in standalone mode
    const checkMobileAndStandalone = () => {
      const userAgent = window.navigator.userAgent.toLowerCase();
      const mobile = /iphone|ipad|ipod|android/.test(userAgent);
      const ios = /iphone|ipad|ipod/.test(userAgent);
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;

      setIsIOS(ios);

      // We only care about mobile devices viewing the website in a standard browser tab.
      // Definitively block desktop.
      if (!mobile || isStandalone) {
        return;
      }

      // If they are on a mobile browser tab, wait to see if the intent fires.
      // If it doesn't fire within 500ms, assume the PWA is already installed.
      installCheckTimeout = setTimeout(() => {
        if (!promptFired) {
          setIsInstalled(true);
          setIsPromptVisible(true);
        }
      }, 500);
    };

    checkMobileAndStandalone();

    // If the user already installed the PWA, clear the state
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsPromptVisible(false);
      setShowInstructions(false);
      setIsInstalled(true);
    };

    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      clearTimeout(installCheckTimeout);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isInstalled) {
      if (isIOS) {
        toast({
          title: "Open OneCamp from your home screen",
          description: "Tap the OneCamp icon on your home screen to open the app.",
        });
        return;
      }

      // User tapped "Open App". Injecting a hidden target="_blank" anchor link and clicking it.
      // This is the most reliable way to trigger Chrome's WebAPK intent interceptor on Android.
      const url = window.location.origin;
      const a = document.createElement("a");
      a.href = url + "/app/home"; // Use a deep link destination to encourage intent handling
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    if (!deferredPrompt) {
      // If Chrome blocked the intent (or iOS Safari), show manual instructions
      setShowInstructions(true);
      return;
    }

    // Show the installation prompt natively
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;

    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
    setIsPromptVisible(false);
  };

  const handleDismiss = () => {
    setIsPromptVisible(false);
    setShowInstructions(false);
  };

  if (!isPromptVisible) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[var(--z-devtools)] md:w-[400px] md:left-auto md:right-4">
      <div className="flex flex-col p-4 bg-background/95 backdrop-blur-xl border border-border/50 shadow-lg rounded-xl relative overflow-hidden transition-all duration-300">
        
        {!showInstructions ? (
          <div className="flex items-center gap-4 relative z-10 w-full pr-8">
            <div className="relative w-12 h-12 shrink-0 rounded-xl overflow-hidden shadow-sm">
              <Image
                src="/logo.svg"
                alt="OneCamp App Icon"
                fill
                className="object-cover"
              />
            </div>
            
            <div className="flex flex-col">
              <h4 className="text-sm font-medium text-foreground">
                {isInstalled ? "Open OneCamp" : "Install OneCamp"}
              </h4>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {isInstalled 
                  ? "Launch the application natively for the best experience."
                  : "Add to your home screen for quick access and instant notifications."}
              </p>
            </div>

            <div className="flex items-center gap-2 relative z-10 shrink-0 ml-auto mr-1">
              <button
                onClick={handleInstallClick}
                className="px-4 py-2 text-xs font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-full transition-colors whitespace-nowrap"
              >
                {isInstalled ? "Open App" : "Install"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 relative z-10 pr-6 pl-2 py-1">
            <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
              Manual Installation
            </h4>
            {isIOS ? (
              <p className="text-xs text-muted-foreground leading-relaxed">
                1. Tap the <Share className="inline w-3 h-3 mx-1 text-foreground" /> <strong>Share</strong> button at the bottom navigation bar.<br/>
                2. Scroll down and tap <strong>"Add to Home Screen"</strong>.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground leading-relaxed">
                1. Tap the <MoreVertical className="inline w-3 h-3 text-foreground" /> <strong>Menu</strong> button in your browser's top right corner.<br/>
                2. Select <strong>"Install App"</strong> or <strong>"Add to Home screen"</strong>.
              </p>
            )}
          </div>
        )}

        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 p-1.5 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors z-20"
          aria-label="Dismiss install prompt"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
