"use client";

import { MobileHome } from "@/components/home/mobile/mobileHome";
import { DesktopDashboard } from "@/components/home/desktop/desktopDashboard";
import { useMedia } from "@/context/MediaQueryContext";

export default function Home() {
    const { isDesktop } = useMedia();
    return isDesktop ? <DesktopDashboard /> : <MobileHome />;
}