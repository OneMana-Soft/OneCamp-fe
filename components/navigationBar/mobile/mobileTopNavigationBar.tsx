"use client"

import {MobileTopNavigationBarFirst} from "@/components/navigationBar/mobile/mobileTopNavigationBarFirst";
import {MobileTopNavigationBarSecond} from "@/components/navigationBar/mobile/mobileTopNavigationBarSecond";
import {MobileTopNavigationBarThird} from "@/components/navigationBar/mobile/mobileTopNavigationBarThird";

/**
 * The phone's top bar (design v3, Ph1): 52px plus the safe area on the
 * sheet's colour, so the bar and the page under it are one surface. Its
 * hairline shows only once the page has scrolled (`scrolled`, from a sentinel
 * at the top of the scroller in MobileNavigationBar), fading in over 140ms;
 * at the top of a page there is nothing to separate.
 */
export function MobileTopNavigationBar({
    scrolled = false,
    glow = false,
    large = false,
    largePassed = false,
}: {
    scrolled?: boolean;
    glow?: boolean;
    /** The page opens on a large title, so the bar's own waits (design v3, mobile C2). */
    large?: boolean;
    /** The large title has scrolled up under the bar: the bar's own comes in. */
    largePassed?: boolean;
}) {

    return (
        <div
            data-phone-topbar=""
            data-scrolled={scrolled ? "true" : "false"}
            // A tab's root: clear over the theme's glow until the page moves
            // (app/phone.css, design v3 mobile F5).
            data-glow={glow || undefined}
            data-large={large || undefined}
            data-large-passed={largePassed || undefined}
            className='phone-topbar relative w-full shrink-0 z-[var(--z-fixed)] bg-sheet'
            style={{
                paddingTop: 'env(safe-area-inset-top)',
                minHeight: 'calc(3.25rem + env(safe-area-inset-top))'
            }}
        >
            {/* The sides are equal (1fr each), so the title sits in the middle
                of the bar whatever each side holds. Centred in what the sides
                left, it sat 48px left of centre on Home, 6px on Channels, on it
                on DMs and 22px right on Activity: a 70px jump between tabs. A
                title too long for the middle still takes what the sides don't
                need, and truncates. The sides never shrink below their buttons
                (no min-w-0): when they could, a long title took their room and
                ran over the back button and the doc's Comments (312px). */}
            <div data-phone-bar="" className='grid grid-cols-[1fr_minmax(0,auto)_1fr] items-center h-13 w-full px-1.5 gap-2'>
                <div data-phone-bar-side="" className='flex items-center justify-start'><MobileTopNavigationBarFirst/></div>
                <div className='min-w-0 flex items-center justify-center'><MobileTopNavigationBarSecond/></div>
                {/* data-phone-bar-end: where a page's own tools go (PhoneBarActions). */}
                <div data-phone-bar-side="" className='flex items-center justify-end' data-phone-bar-end=""><MobileTopNavigationBarThird/></div>
            </div>
        </div>


    );
}