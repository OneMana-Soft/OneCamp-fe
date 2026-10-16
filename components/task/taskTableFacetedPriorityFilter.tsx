import { useTranslation } from "react-i18next"
import { FilterChip } from "@/components/task/filterChip"
import { Column } from "@tanstack/react-table";

import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {priorities} from "@/types/table";
import {TaskPriorityCell} from "@/components/task/taskPriorityCell";

interface DataTableFacetedFilterProps<TData, TValue> {
    column?: Column<TData, TValue>;
    title?: string;

}

export function TaskTableFacetedPriorityFilter<TData, TValue>({
                                                          column,
                                                          title,
                                                      }: DataTableFacetedFilterProps<TData, TValue>) {
    const { t } = useTranslation()
    const selectedValues = new Set(column?.getFilterValue() as string[]);

    return (
        <Popover>
            <PopoverTrigger asChild>
                <FilterChip title={title ?? ""} count={selectedValues.size} selected={priorities.filter((o) => selectedValues.has(o.value)).map((o) => t(o.value, { defaultValue: o.label }))} />
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" align="start">
                <Command>
                    <CommandInput placeholder={title} />
                    <CommandList>
                        <CommandEmpty>{t('noResultFound')}</CommandEmpty>
                        <CommandGroup>
                            {priorities.map((option) => {
                                const isSelected = selectedValues.has(option.value);
                                return (
                                    <CommandItem
                                        key={option.value}
                                        checked={isSelected}
                                        onSelect={() => {
                                            if (isSelected) {
                                                selectedValues.delete(option.value);
                                            } else {
                                                selectedValues.add(option.value);
                                            }
                                            const filterValues = Array.from(selectedValues);
                                            column?.setFilterValue(
                                                filterValues.length ? filterValues : undefined
                                            );
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
                        {selectedValues.size > 0 && (
                            <>
                                <CommandSeparator />
                                <CommandGroup>
                                    <CommandItem
                                        onSelect={() => column?.setFilterValue(undefined)}
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
