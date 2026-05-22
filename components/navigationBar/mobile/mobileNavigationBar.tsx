import {MobileTopNavigationBar} from "@/components/navigationBar/mobile/mobileTopNavigationBar";
import {MobileBottomNavigationBar} from "@/components/navigationBar/mobile/mobileBottomNavigationBar";
import { cn } from "@/lib/utils/helpers/cn";

export function MobileNavigationBar({
                                               children,
                                               disableBottomPadding = false,
                                           }: Readonly<{
    children: React.ReactNode;
    disableBottomPadding?: boolean;
}>) {

    return (
        <>
            <div className="flex flex-col h-dvh overscroll-none">
                <MobileTopNavigationBar/>

                <div className={cn(
                    "flex-1 overflow-y-auto",
                    !disableBottomPadding && "pb-[calc(4rem+env(safe-area-inset-bottom))]"
                )}>
                    {children}
                </div>

                <MobileBottomNavigationBar />
            </div>
        </>
    );
}