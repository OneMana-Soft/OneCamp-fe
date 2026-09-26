import { useTranslation } from "react-i18next"
import { CheckIcon, PlusCircledIcon } from "@radix-ui/react-icons";

import { cn } from "@/lib/utils/helpers/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Separator } from "@/components/ui/separator";
import {UserProfileDataInterface} from "@/types/user";



interface KanbanProjectFilterProps {
  activeList: string[];
  updateList: (l: string[])=>void;
  members?: UserProfileDataInterface[]

}

export function ProjectTaskKanbanAssigneeFilter({
                                                activeList,
                                                updateList,
                                                members

}: KanbanProjectFilterProps) {
    const { t } = useTranslation()

    return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          <PlusCircledIcon className="mr-2 h-4 w-4" />
          {"Assignee"}
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
                    {activeList.length} {t('selected')}
                  </Badge>
                ) : members && (
                    members
                    .filter((option) => activeList.includes(option.uid || ""))
                    .map((option) => (
                      <Badge
                        variant="secondary"
                        key={option.uid}
                        className="rounded-sm px-1 font-normal"
                      >
                        {option.user_name}
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
          <CommandInput placeholder={"Project"} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {members && members.map((option) => {
                const isSelected = activeList.includes(option.uid || "");
                return (
                  <CommandItem
                    key={option.uid}
                    onSelect={() => {
                      if (isSelected) {
                        updateList(activeList.filter((item) => item !== (option.uid || "")))
                      } else {
                        updateList([...activeList, option.uid || ""])
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
                    {/*{option.icon && (*/}
                    {/*  <option.icon className="mr-2 h-4 w-4 text-muted-foreground" />*/}
                    {/*)}*/}
                    <span>{option.user_name}</span>
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
                    Clear filters
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
