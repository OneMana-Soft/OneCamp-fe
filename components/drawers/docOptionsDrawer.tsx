"use client"

import { useDocAbilities } from "@/hooks/useDocAbilities"
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { ChevronLeft, Download } from "@/lib/icons";
import {
    Drawer,
    SheetCancel,
    SheetGroup,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import {DrawerActionLink} from "@/components/drawerActionLink/drawerActionLink";
import {DrawerDestructiveActionLink} from "@/components/drawerActionLink/drawerDestructiveActionLink";
import {useFetch} from "@/hooks/useFetch";
import type {DocInfoResponse} from "@/types/doc";
import {GetEndpointUrl} from "@/services/endPoints";
import "@/components/docEditor/registry";
import { NO_BUS, actionContextOf, busForDoc, editorOf } from "@/components/docEditor/registry/commandBus";
import { useEditionGate } from "@/components/docEditor/registry/gate";
import { actionGroupsFor, type ShownAction } from "@/components/docEditor/registry/readers";
import type { ActionContext } from "@/components/docEditor/registry/types";
import { SHEET_GROUPS, SHEET_SUBSHEETS } from "@/components/docEditor/actions/doc";


interface docOptionsDrawerProps {
    drawerOpenState: boolean;
    setOpenState: (state: boolean) => void;
    isOwner: boolean
    deleteMessage: () => void
    docId: string
}

/** The sheet's group headings; a package's group is named by its id. */
const GROUP_LABEL: Record<string, string> = { doc: "Doc", delete: "Delete" }
const labelOf = (group: string) => GROUP_LABEL[group] ?? group.charAt(0).toUpperCase() + group.slice(1)

/**
 * The phone's doc sheet: the actions registered for it (components/docEditor/
 * actions/doc.ts and the packages': edit the title, share, comments, viewed
 * by, version history, notifications, save for later, focus mode, export,
 * import, copy link, delete), the same actions as a wide screen's More, in the
 * doc page's own context and run through its command bus. A group in
 * SHEET_SUBSHEETS (the four exports) is one row that opens as a sheet of its
 * own. What destroys is alone, and last (design v3, mobile C7).
 */
export function DocOptionsDrawer({drawerOpenState, setOpenState, docId, isOwner, deleteMessage}: docOptionsDrawerProps) {
    const gate = useEditionGate()
    const docInfo = useFetch<DocInfoResponse>(docId ? `${GetEndpointUrl.GetDocInfo}/${docId}` : '');
    // The group open as a sheet of its own (Export), or the sheet itself.
    const [subsheet, setSubsheet] = useState<string | null>(null)

    function closeDrawer() {
        setSubsheet(null)
        setOpenState(false);
    }

    const handleDeleteClick = () => {
        setTimeout(() => {
            deleteMessage()
        }, 100);
        closeDrawer()
    }

    // The same rule as the desktop menu: what the server decided (lib/docs/abilities).
    const abilities = useDocAbilities(docInfo.data?.data)
    const canEdit = abilities.edit

    // The doc page's own context, read from its bus as the sheet opens, so the
    // sheet knows what More knows (Later, focus mode, who may share: QA DSA-06,
    // DSA-14); this sheet's own only when no page gave one, with the page's
    // rule for Share (B6: an editor opens it too).
    const context = (): ActionContext => {
        const bus = busForDoc(docId) ?? NO_BUS
        return actionContextOf(bus) ?? { docId, editor: editorOf(bus) ?? null, canEdit, abilities, bus, gate, state: { owner: isOwner, canShare: abilities.edit, title: docInfo.data?.data?.doc_title } }
    }
    const groups = drawerOpenState ? actionGroupsFor("phoneSheet", context(), SHEET_GROUPS) : []
    const open = subsheet ? groups.find((g) => g.group === subsheet) : undefined

    const row = (a: ShownAction) => {
        const Icon = a.icon as LucideIcon
        // Delete is the page's to confirm (it was handed in).
        const choose = a.action.id === "doc.delete"
            ? handleDeleteClick
            : () => {
                closeDrawer()
                void a.run()
            }
        return a.action.destructive ? (
            <DrawerDestructiveActionLink key={a.action.id} onLinkClick={choose} linkText={a.label} Icon={Icon} />
        ) : (
            <DrawerActionLink key={a.action.id} onLinkClick={choose} linkText={a.label} Icon={Icon} />
        )
    }

    return (
        <Drawer detent="menu" onOpenChange={closeDrawer} open={drawerOpenState}>
            <DrawerContent>
                <div className="w-full pb-2">
                    <DrawerHeader className='hidden'>
                        <DrawerTitle></DrawerTitle>
                        <DrawerDescription></DrawerDescription>
                    </DrawerHeader>
                    {open ? (
                        <SheetGroup label={labelOf(open.group)} data-subsheet={open.group}>
                            <DrawerActionLink onLinkClick={() => setSubsheet(null)} linkText="Back" Icon={ChevronLeft} />
                            {open.actions.map(row)}
                        </SheetGroup>
                    ) : (
                        groups.map((g) =>
                            SHEET_SUBSHEETS.includes(g.group) && g.actions.length > 1 ? (
                                <SheetGroup key={g.group} label={labelOf(g.group)}>
                                    <DrawerActionLink onLinkClick={() => setSubsheet(g.group)} linkText={`${labelOf(g.group)}…`} Icon={Download} />
                                </SheetGroup>
                            ) : (
                                <SheetGroup key={g.group} label={labelOf(g.group)}>
                                    {g.actions.map(row)}
                                </SheetGroup>
                            ),
                        )
                    )}
                    <SheetCancel />
                </div>
            </DrawerContent>
        </Drawer>
    )
}
