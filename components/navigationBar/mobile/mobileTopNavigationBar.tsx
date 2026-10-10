"use client"

import {MobileTopNavigationBarFirst} from "@/components/navigationBar/mobile/mobileTopNavigationBarFirst";
import {MobileTopNavigationBarSecond} from "@/components/navigationBar/mobile/mobileTopNavigationBarSecond";
import {MobileTopNavigationBarThird} from "@/components/navigationBar/mobile/mobileTopNavigationBarThird";

export function MobileTopNavigationBar() {

    return (
        <div 
            className='w-full z-[var(--z-fixed)] border-b border-border/60 bg-sidebar'
            style={{ 
                paddingTop: 'env(safe-area-inset-top)',
                minHeight: 'calc(3.5rem + env(safe-area-inset-top))'
            }}
        >
            {/* The sides are equal (1fr each), so the title sits in the middle
                of the bar whatever each side holds. Centred in what the sides
                left, it sat 48px left of centre on Home, 6px on Channels, on it
                on DMs and 22px right on Activity: a 70px jump between tabs. A
                title too long for the middle still takes what the sides don't
                need, and truncates. */}
            <div data-phone-bar="" className='grid grid-cols-[1fr_minmax(0,auto)_1fr] items-center h-14 w-full px-2 gap-2'>
                <div className='flex min-w-0 items-center justify-start'><MobileTopNavigationBarFirst/></div>
                <div className='min-w-0 flex items-center justify-center'><MobileTopNavigationBarSecond/></div>
                <div className='flex min-w-0 items-center justify-end'><MobileTopNavigationBarThird/></div>
            </div>
        </div>


    );
}