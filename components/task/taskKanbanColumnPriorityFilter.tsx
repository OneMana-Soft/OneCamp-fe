import { useTranslation } from "react-i18next"
import { FilterChip } from "@/components/task/filterChip"
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator
} from "@/components/ui/command";
import {priorities} from "@/types/table";
import {TaskPriorityCell} from "@/components/task/taskPriorityCell";

type TaskCardProps = {
    activeList: string[];
    updateList: (l: string[])=>void;
};

export function TaskKanbanColumnPriorityFilter({ activeList, updateList}: TaskCardProps) {
    const { t } = useTranslation()


    return (
        <Popover>
            <PopoverTrigger asChild>
                <FilterChip title={t("priority")} count={activeList.length} selected={priorities.filter((o) => activeList.includes(o.value)).map((o) => t(o.value, { defaultValue: o.label }))} />
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" align="start">
                <Command>
                    <CommandInput placeholder={t('priority')} />
                    <CommandList>
                        <CommandEmpty>No results found.</CommandEmpty>
                        <CommandGroup>
                            {priorities.map((option) => {
                                const isSelected = activeList.includes(option.value);
                                return (
                                    <CommandItem
                                        key={option.value}
                                        checked={isSelected}
                                        onSelect={() => {
                                            if (isSelected) {
                                                updateList(activeList.filter((item) => item !== option.value))
                                            } else {
                                                updateList([...activeList, option.value])
                                            }

                                        }}
                                    >
                                        <TaskPriorityCell priority={option}/>

                                        {/*{facets?.get(option.value) && (*/}
                                        {/*  <span className="ml-auto flex h-4 w-4 items-center justify-center font-mono text-xs">*/}
                                        {/*    {facets.get(option.value)}*/}
                                        {/*  </span>*/}
                                        {/*)}*/}
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                        {activeList.length > 0 && (
                            <>
                                <CommandSeparator />
                                <CommandGroup>
                                    <CommandItem
                                        onSelect={() => updateList([])}
                                        className="justify-center text-center"
                                    >
                                        {t('clearFilters')}
                                    </CommandItem>
                                </CommandGroup>
                            </>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}