"use client";

import { useEffect, useState } from "react";
import { lazyPart } from "@/lib/lazy/lazyPart";
import { onPaletteWanted, openPalette } from "@/lib/ui/palette";
import { runWhenQuiet } from "@/lib/ui/whenQuiet";

/**
 * The palette (components/ui/CommandPalette, 66 KB of source) mounts on its
 * first use: ⌘K or ⌘P, or any opener's request (the sidebar pill, the phone's
 * search icon, a 404's Search). It was fetched and mounted with every page, on
 * a phone too (FLUIDITY-LEAD, fluid-13 and fluid-15). A press before its code
 * has come is kept as a request (lib/ui/palette), which the palette takes as
 * it mounts, so the first press is never lost. On a computer its code is
 * fetched once the page is quiet, so the first ⌘K opens at once.
 */
const palette = lazyPart(() => import("@/components/ui/CommandPalette").then((m) => m.CommandPalette));

/** A computer's pointer: the palette's code is worth fetching ahead there. */
const onComputer = () => {
  try {
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  } catch {
    return false;
  }
};

export function CommandPaletteLoader() {
  const [wanted, setWanted] = useState(false);
  useEffect(() => {
    if (wanted) return;
    const down = (e: KeyboardEvent) => {
      // Taken already: a doc's ⌘K with text selected adds a link.
      if (e.defaultPrevented) return;
      if ((e.key === "k" || e.key === "p") && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        openPalette({ mode: "search" });
      }
    };
    const off = onPaletteWanted(() => setWanted(true));
    document.addEventListener("keydown", down);
    const cancel = onComputer() ? runWhenQuiet([() => palette.warm()]) : undefined;
    return () => {
      document.removeEventListener("keydown", down);
      off();
      cancel?.();
    };
  }, [wanted]);
  return wanted ? <palette.Part /> : null;
}
