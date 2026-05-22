"use client"

import {MobileTopNavigationBarFirst} from "@/components/navigationBar/mobile/mobileTopNavigationBarFirst";
import {MobileTopNavigationBarSecond} from "@/components/navigationBar/mobile/mobileTopNavigationBarSecond";
import {MobileTopNavigationBarThird} from "@/components/navigationBar/mobile/mobileTopNavigationBarThird";

export function MobileTopNavigationBar() {

    return (
        <div 
            className='w-full z-[var(--z-fixed)] border-b border-border/60 bg-sidebar backdrop-blur'
            style={{ 
                paddingTop: 'env(safe-area-inset-top)',
                minHeight: 'calc(3.5rem + env(safe-area-inset-top))'
            }}
        >
            <div className='grid grid-cols-[auto_1fr_auto] items-center h-14 w-full px-2 gap-2'>
                <div className='flex items-center'><MobileTopNavigationBarFirst/></div>
                <div className='min-w-0 flex items-center justify-center'><MobileTopNavigationBarSecond/></div>
                <div className='flex items-center'><MobileTopNavigationBarThird/></div>
            </div>
        </div>


    );
}