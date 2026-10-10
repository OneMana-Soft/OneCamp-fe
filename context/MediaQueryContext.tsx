"use client";

import { createContext, useContext, useLayoutEffect, useState } from "react";

type MediaQueryContextType = {
    isMobile: boolean;
    isTablet: boolean;
    isDesktop: boolean;
};

const MediaQueryContext = createContext<MediaQueryContextType | undefined>(undefined);

export function MediaQueryProvider({ children }: { children: React.ReactNode }) {
    const [screenSize, setScreenSize] = useState<MediaQueryContextType>({
        isMobile: false,
        isTablet: false,
        isDesktop: false,
    });

    useLayoutEffect(() => {
        const updateSize = () => {
            const w = window.innerWidth;
            const next: MediaQueryContextType = {
                isMobile: w < 640, // Tailwind's `sm`
                isTablet: w >= 640 && w < 1024, // `md`
                // Desktop means "not mobile", the same rule LayoutContent uses
                // to pick the desktop shell. Pages render `isMobile && …` or
                // `isDesktop && …`; when desktop began at 1024, every page drew
                // nothing between 640 and 1023: tablets, and any half-screen
                // window on a 1920 display (a tiled window on Omarchy).
                isDesktop: w >= 640,
            };
            // The same object unless a breakpoint changed. A phone fires resize
            // every time its address bar shows or hides (a height change, on
            // most scrolls), and a new object each time re-rendered every
            // screen-size consumer in the app: the shell, the lists, each row.
            setScreenSize((prev) =>
                prev.isMobile === next.isMobile && prev.isTablet === next.isTablet && prev.isDesktop === next.isDesktop
                    ? prev
                    : next,
            );
        };

        updateSize(); // Check on mount
        window.addEventListener("resize", updateSize);

        return () => window.removeEventListener("resize", updateSize);
    }, []);

    return <MediaQueryContext.Provider value={screenSize}>{children}</MediaQueryContext.Provider>;
}

export function useMedia() {
    const context = useContext(MediaQueryContext);
    if (!context) throw new Error("useMedia must be used within a MediaQueryProvider");
    return context;
}