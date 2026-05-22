"use client"

import * as React from "react"
import { CircleUser, Users } from "@/lib/icons";

import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"


interface taskOptionsDrawerProps {
    drawerOpenState: boolean;
    setOpenState: (state: boolean) => void;
}

export function TaskOptionsDrawer({drawerOpenState, setOpenState}: taskOptionsDrawerProps) {


    function closeDrawer() {
        setOpenState(false);
    }

    return (
        <Drawer  onOpenChange={closeDrawer} open={drawerOpenState}>
            <DrawerContent>
                <div className=" w-full mb-6">
                    <DrawerHeader className='hidden'>
                        <DrawerTitle></DrawerTitle>
                        <DrawerDescription></DrawerDescription>

                    </DrawerHeader>
                    <div className="p-4 pb-2">
                        <div className="flex flex-col items-center justify-start space-y-2">
                            <div
                                className='w-full h-12 flex space-x-3 items-center'
                            >
                                <CircleUser/>
                                <span>People</span>
                            </div>
                            <div
                                className='w-full h-12 flex space-x-3 items-center'
                            >
                                <Users/>
                                <span >Teams</span>
                            </div>
                        </div>

                    </div>
                    {/*<DrawerFooter>*/}
                    {/*    <Button>Submit</Button>*/}
                    {/*    <DrawerClose asChild>*/}
                    {/*        <Button variant="outline">Cancel</Button>*/}
                    {/*    </DrawerClose>*/}
                    {/*</DrawerFooter>*/}
                </div>
            </DrawerContent>
        </Drawer>
    )
}
