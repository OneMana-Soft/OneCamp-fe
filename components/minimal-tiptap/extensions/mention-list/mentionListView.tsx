"use client"

import type { Editor } from "@tiptap/core";
import { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { type SuggestionListExtras } from "../suggestion-popup";
import { UserProfileDataInterface } from "@/types/user";
import MentionMember, { MentionAvatar } from "./mentionMember";
import { CommandList, CommandTile, type CommandListHandle, type CommandListItem } from "@/components/ui/CommandList";
import store from "@/store/store";
import { updateMentionOpenedRecently } from "@/store/slice/mentionSlice";
import { displayNameOf } from "@/lib/personName";
import { useBotKindMap } from "@/hooks/useBotKinds";
import { isAIBot } from "@/lib/botCopy";
import { Bell, Calendar } from "@/lib/icons";
import { useLaterActions } from "@/hooks/useLater";
import { useDebounce } from "@/hooks/useDebounce";
import { countMention } from "@/lib/mentionedOften";
import type { MentionAccess } from "@/services/connectedService";
import type { DateRow } from "./mentionInDoc";
import { Megaphone, Moon, Users } from "@/lib/icons";

import { isBroadcast, isDate, isPerson, isPlace, isTeam, type BroadcastRow, type MentionPick, type MentionSuggestion, type TeamRow } from "./mentionPick";
import { inDoc } from "./mentionList";

// The "@" list itself, loaded when the list first opens (mentionList.tsx).

export type MentionRef = {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
};

export interface MentionProps extends SuggestionProps, SuggestionListExtras {
  items: MentionPick[];
}

/**
 * Who of the people the list offers can't open the doc being written, and
 * whether the writer may share it with them; only in a doc. A check that
 * fails marks nobody: whoever is mentioned without access is still found
 * out at the save, and the writer asked to share (business/Follow).
 */
function useMentionAccess(editor: Editor, people: UserProfileDataInterface[]): MentionAccess | null {
    const doc = inDoc(editor)
    const ids = people.filter((p) => !p.is_bot).map((p) => p.user_uuid).slice(0, 10)
    // Asked of the list as it settles, not at every key typed.
    const key = useDebounce(doc ? ids.join(",") : "", 150)
    const [answer, setAnswer] = useState<MentionAccess | null>(null)
    useEffect(() => {
        const asking = key ? doc : undefined
        if (!asking) return setAnswer(null)
        let live = true
        asking.access(editor, key.split(","))?.then((access) => live && setAnswer(access), () => undefined)
        return () => {
            live = false
        }
    }, [key, doc, editor])
    return answer
}

/**
 * The @mention picker (content.md D24): the area's CommandList at 320 px.
 * A day the query names comes first, with "Remind me" (D4, D6); then people,
 * in a doc its own first and then those the writer mentions most (D2), then
 * agents, 36 px rows with the avatar, name and
 * handle, and an empty state instead of nothing. In a doc, someone who can't
 * open it says so, and picking them shares it with them as well, for a writer
 * who may share it ("Share and mention").
 */
export const MentionList = forwardRef<MentionRef, MentionProps>((props, ref) => {
    const listRef = useRef<CommandListHandle>(null);
    const dates = useMemo(() => props.items.filter(isDate), [props.items]);
    // A conversation's list comes in D-M9's order, rows of every kind; any
    // other's is people before agents.
    const placed = useMemo(() => props.items.find(isPlace), [props.items]);
    const rows = useMemo(() => props.items.filter((p) => !isDate(p) && !isPlace(p)), [props.items]);
    const ordered = useMemo(() => {
        const people = rows.filter(isPerson)
        return placed ? people : [...people.filter((p) => !p.is_bot), ...people.filter((p) => p.is_bot)]
    }, [rows, placed]);
    const access = useMentionAccess(props.editor, ordered);
    const { save } = useLaterActions();

    const selectItem = (person: UserProfileDataInterface | undefined) => {
        if (!person) return;
        const mentionItem: MentionSuggestion = {
            id: `${person.user_uuid}@${person.uid}`,
            mentionLabel: displayNameOf(person),
            label: displayNameOf(person)
        };
        props.command(mentionItem);
        countMention(person.user_uuid);
        store.dispatch(updateMentionOpenedRecently({openedRecently: true}))
        if (access?.can_share && access.cant_open.includes(person.user_uuid)) inDoc(props.editor)?.share(props.editor, person)
    };

    const selectDate = (row: DateRow) => inDoc(props.editor)?.insertDate(props.editor, props.range, row, save);
    // A team's chip and a room's (business/Reach reads them on send): never a
    // person's "<uuid>@<uid>", so nobody is told twice.
    const selectTeam = (row: TeamRow) => props.command({ id: `group:${row.team.team_uuid}`, mentionLabel: row.team.name, label: row.team.name });
    const selectBroadcast = (row: BroadcastRow) => props.command({ id: `broadcast:${row.broadcast}`, mentionLabel: row.broadcast, label: row.broadcast });

    const botKinds = useBotKindMap();
    const items: CommandListItem[] = useMemo(
        () => [
            ...dates.map((row) => ({
                id: `${row.kind}:${row.offer.date}`,
                label: row.kind === "remind" ? "Remind me" : row.offer.label,
                group: "Dates",
                tile: <CommandTile>{row.kind === "remind" ? <Bell /> : <Calendar />}</CommandTile>,
                meta: row.kind === "remind" ? row.offer.remind : row.offer.detail,
            })),
            ...(placed ? rows : ordered).map((row): CommandListItem => {
                if (isTeam(row)) {
                    const { team } = row
                    return {
                        id: `team:${team.team_uuid}`,
                        label: team.name,
                        group: "Teams",
                        tile: <CommandTile><Users /></CommandTile>,
                        meta: team.here ? `${team.here} ${team.here === 1 ? "person" : "people"} here will be told` : "Nobody in it is here",
                    }
                }
                if (isBroadcast(row)) {
                    const where = row.channel ? `#${row.channel}` : "this channel"
                    return {
                        id: `broadcast:${row.broadcast}`,
                        label: `@${row.broadcast}`,
                        group: "Notify everyone",
                        tile: <CommandTile><Megaphone /></CommandTile>,
                        meta: row.broadcast === "here" ? `Everyone in ${where} who is here now` : `Everyone in ${where}${row.count ? ` · ${row.count}` : ""}`,
                        disabled: !!row.why,
                        disabledReason: row.why,
                    }
                }
                const person = row as UserProfileDataInterface
                const shut = !person.is_bot && !!access?.cant_open.includes(person.user_uuid)
                const notHere = !!placed?.notHere.has(person.user_uuid)
                const where = placed?.known.name ? `#${placed.known.name}` : "this conversation"
                return {
                    id: person.user_uuid,
                    text: displayNameOf(person),
                    label: <MentionMember person={person} />,
                    group: person.is_bot ? "Agents" : notHere ? "Others" : "People",
                    tile: <MentionAvatar person={person} />,
                    // An agent says what asking it means (chat C41): it acts
                    // for whoever asks, with what they may do. No owner is
                    // named: the people list doesn't carry an agent's sponsor.
                    // Someone who can't open the doc says so (never an agent).
                    meta: person.is_bot && isAIBot(botKinds?.[person.user_uuid] ?? person.user_bot_kind) ? "Agent · acts for you"
                        : shut ? "Can't open this doc"
                        : notHere ? `Not in ${where}`
                        : placed?.night[person.user_uuid] ? <span className="inline-flex items-center gap-1"><Moon className="size-3" aria-hidden="true" />{placed.night[person.user_uuid]}</span>
                        : undefined,
                    trailing: shut && access?.can_share ? <span className="shrink-0 text-meta font-[510] text-brand-text">Share and mention</span> : undefined,
                }
            }),
        ],
        [dates, ordered, rows, placed, botKinds, access],
    );

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }: SuggestionKeyDownProps) => listRef.current?.onKeyDown(event) ?? false,
    }));

    if (!items.length && !props.query) return null;
    return (
        <div data-mention-list="">
            <CommandList
                ref={listRef}
                comboboxFor={props.comboboxFor}
                label={inDoc(props.editor) ? "Mention someone or a date" : "Mention someone"}
                className="w-80"
                roomy
                maxHeight={8 * 36 + 32}
                items={items}
                onSelect={(item) => {
                    const date = dates.find((d) => `${d.kind}:${d.offer.date}` === item.id)
                    const team = rows.filter(isTeam).find((r) => `team:${r.team.team_uuid}` === item.id)
                    const room = rows.filter(isBroadcast).find((r) => `broadcast:${r.broadcast}` === item.id)
                    if (date) selectDate(date)
                    else if (team) selectTeam(team)
                    else if (room) selectBroadcast(room)
                    else selectItem(ordered.find((p) => p.user_uuid === item.id))
                }}
                empty={<span className="text-ink-3">No one called “{props.query}” here</span>}
            />
        </div>
    );
});
