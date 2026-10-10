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
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";

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
            <Tooltip>
                <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                        <Button aria-label="More actions" variant="ghost" size="icon" className="h-8 w-8 ">
                            <MoreVertical className="h-4 w-4" stroke='#616060'/>
                        </Button>
                    </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>
                    <p>More options</p>
                </TooltipContent>
            </Tooltip>
            <DropdownMenuContent className="w-56" align="end" forceMount>

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