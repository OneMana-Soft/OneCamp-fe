"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const CommandPaletteLazy = dynamic(
  () => import("@/components/ui/CommandPalette").then((mod) => ({ default: mod.CommandPalette })),
  {
    ssr: false,
    loading: () => null,
  }
);

export function CommandPaletteLoader() {
  return <CommandPaletteLazy />;
}
