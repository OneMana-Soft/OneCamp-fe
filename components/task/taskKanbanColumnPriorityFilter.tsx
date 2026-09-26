import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {CheckIcon, PlusCircledIcon} from "@radix-ui/react-icons";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator
} from "@/components/ui/command";
import {cn} from "@/lib/utils/helpers/cn";
import {Separator} from "@/components/ui/separator";
import {Badge} from "@/components/ui/badge";
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
                <Button variant="outline" size="sm" className="h-8 border-dashed">
                    <PlusCircledIcon className="mr-2 h-4 w-4" />
                    {t('priority')}
                    {activeList.length > 0 && (
                        <>
                            <Separator orientation="vertical" className="mx-2 h-4" />
                            <Badge
                                variant="secondary"
                                className="rounded-sm px-1 font-normal lg:hidden"
                            >
                                {activeList.length}
                            </Badge>
                            <div className="hidden space-x-1 lg:flex">
                                {activeList.length > 2 ? (
                                    <Badge
                                        variant="secondary"
                                        className="rounded-sm px-1 font-normal"
                                    >
                                        {activeList.length} selected
                                    </Badge>
                                ) :  (
                                    priorities
                                        .filter((option) => activeList.includes(option.value))
                                        .map((option) => (
                                            <Badge
                                                variant="secondary"
                                                key={option.value}
                                                className="rounded-sm px-1 font-normal"
                                            >
                                                {option.label}
                                            </Badge>
                                        ))
                                )}
                            </div>
                        </>
                    )}
                </Button>
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
                                        onSelect={() => {
                                            if (isSelected) {
                                                updateList(activeList.filter((item) => item !== option.value))
                                            } else {
                                                updateList([...activeList, option.value])
                                            }

                                        }}
                                    >
                                        <div
                                            className={cn(
                                                "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                                isSelected
                                                    ? "bg-primary text-primary-foreground"
                                                    : "opacity-50 [&_svg]:invisible"
                                            )}
                                        >
                                            <CheckIcon className={cn("h-4 w-4")} />
                                        </div>
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