"use client";

import * as React from "react"
import { Moon, Sun } from "@/lib/icons";

import { Button } from "@/components/ui/button"
import { lazyPiece } from "@/lib/lazy/lazyPiece"
import { focusCarry } from "@/lib/ui/focusCarry"

// The menu is a piece of its own: the signed-out pages carry only this button,
// not the menu primitive. Offline, the button stays and a press asks again.
const Menu = lazyPiece(() => import("@/components/themeProvider/themeMenu").then((m) => ({ default: m.ThemeMenu })), {
    failed: ({ trigger, onOpenChange, retry }) =>
        React.cloneElement(trigger as React.ReactElement<{ onClick?: () => void }>, {
            onClick: () => {
                onOpenChange(true)
                retry()
            },
        }),
})

export function ThemeToggle() {
    const [open, setOpen] = React.useState(false)
    // Asked for after the first draw, in a transition: the stand-in stays until the menu's button replaces it.
    const [asked, setAsked] = React.useState(false)
    React.useEffect(() => React.startTransition(() => setAsked(true)), [])
    // The menu draws its own button in the stand-in's place as it lands, and
    // the carry gives it the focus the stand-in had (F6: a keyboard user was
    // left on <body>). It goes by the button's name, so the name is its label.
    const [carry] = React.useState(focusCarry)
    const button = (opens?: () => void) => (
        // 44px on mobile, the desktop 36px from md up — same mobile-first
        // split as Input. size="icon" alone is 36px, which is under the
        // touch guidance; caught by e2e/designSystem.spec.ts at 390px.
        <Button ref={carry} variant="ghost" size="icon" className="h-11 w-11 md:h-9 md:w-9" aria-label="Toggle theme" aria-haspopup="menu" onClick={opens}>
            <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition dark:rotate-0 dark:scale-100" />
        </Button>
    )
    // A press before the menu lands opens it when it does.
    const standIn = button(() => setOpen(true))
    return <React.Suspense fallback={standIn}>{asked ? <Menu open={open} onOpenChange={setOpen} trigger={button()} /> : standIn}</React.Suspense>
}
