"use client"

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {Button} from "@/components/ui/button";
import { Bell, ListTodo, MoreVertical, Pencil, Trash2 } from "@/lib/icons";
import { cn } from "@/lib/utils/helpers/cn";
import { ACTION_TIP_END } from "@/components/MessageDesktopHover/actionTip";

interface MessageDesktopDropdownProps {
    setIsDropdownOpen: (open: boolean) => void;
    getReplyNotification?: () => void;
    /** Opens the task form drafted from this message. */
    onMakeTask?: () => void;
    editMessage: () => void;
    isAdmin?: boolean;
    isOwner: boolean;
    deleteMessage: () => void;
}

export default function MessageDesktopDropdown({ isOwner, isAdmin, setIsDropdownOpen, getReplyNotification, onMakeTask, editMessage, deleteMessage }: MessageDesktopDropdownProps) {

    return (
        <DropdownMenu
            onOpenChange={(open) => {
                setIsDropdownOpen(open);
            }}
        >
            {/* Labelled by a CSS tip (actionTip.ts): the toolbar this sits in is
                built on every hover, and a Radix tooltip here cost more than the
                menu's trigger itself. */}
            <DropdownMenuTrigger asChild>
                <Button aria-label="More actions" data-tip="More actions" variant="ghost" size="icon" className={cn("h-8 w-8", ACTION_TIP_END)}>
                    <MoreVertical className="h-4 w-4 text-muted-foreground"/>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end">

                <DropdownMenuGroup>
                    {onMakeTask && <DropdownMenuItem onClick={onMakeTask}>
                        <div className='flex items-center justify-center space-x-1.5'>
                            <div>
                                <ListTodo className='h-4 w-4'/>
                            </div>
                            <div>
                                Make a task
                            </div>
                        </div>
                    </DropdownMenuItem>}
                    {getReplyNotification && <DropdownMenuItem onClick={getReplyNotification}>
                        <div className='flex items-center justify-center space-x-1.5'>
                            <div>
                                <Bell className='h-4 w-4'/>
                            </div>
                            <div>
                                Get reply notification
                            </div>
                        </div>

                        {/*<DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>*/}
                    </DropdownMenuItem>}
                    {isOwner && <DropdownMenuItem onClick={editMessage}>
                        <div className='flex items-center justify-center space-x-1.5'>
                            <div>
                                <Pencil className='h-4 w-4'/>
                            </div>
                            <div>
                                Edit message
                            </div>
                        </div>

                        {/*<DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>*/}
                    </DropdownMenuItem>}
                </DropdownMenuGroup>
                {(isAdmin || isOwner) && <DropdownMenuSeparator/>}
                {(isAdmin || isOwner) && <DropdownMenuItem onClick={deleteMessage}>

                    <div className='flex items-center justify-center space-x-1.5 text-danger-ink'>
                        <div>
                            <Trash2 className='h-4 w-4'/>
                        </div>
                        <div>
                            Delete message
                        </div>
                    </div>
                    {/*<DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>*/}
                </DropdownMenuItem>}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}