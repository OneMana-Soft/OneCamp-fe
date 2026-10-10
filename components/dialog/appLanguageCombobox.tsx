import { Check, ChevronsUpDown } from "@/lib/icons";
import { cn } from "@/lib/utils/helpers/cn"
import { Button } from "@/components/ui/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem, CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import {useState} from "react";
import {appLangList} from "@/types/user";

interface AppLanguageComboboxProps {
    userLang?: string;
    onLangChange: (c: string) => void;
    /** From <FormControl>: ties the field's label, help and error to the trigger. */
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
}

/**
 * The language field. It sits in a grid of text inputs, so its trigger is
 * drawn as one of them: the same height (44px on a phone, 36px from md up),
 * hairline, padding and type, with the value in the field's normal weight.
 */
export function AppLanguageCombobox({ userLang, onLangChange, ...control }: AppLanguageComboboxProps) {
    const [open, setOpen] = useState(false)
    const current = userLang ? appLangList[userLang] : undefined

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    {...control}
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="h-11 w-full justify-between rounded-md border-input bg-transparent px-3 text-base font-normal shadow-none hover:border-faint-foreground hover:bg-transparent md:h-9 md:text-sm"
                >
                    <span className={cn("truncate", !current && "text-muted-foreground")}>
                        {current ? current.name : "Choose a language"}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                    <CommandInput placeholder="Search languages…" aria-label="Search languages" />
                    <CommandList className="max-h-[200px] overflow-y-auto">
                        <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">No language by that name.</CommandEmpty>
                        <CommandGroup>
                            {Object.values(appLangList).map((e) => (
                                <CommandItem
                                    key={e.code}
                                    value={e.code}
                                    keywords={[e.name]}
                                    onSelect={() => {
                                        setOpen(false)
                                        onLangChange?.(e.code)
                                    }}
                                    className="cursor-pointer"
                                >
                                    <span className="flex-1">{e.name}</span>
                                    <Check
                                        aria-hidden="true"
                                        className={cn(
                                            "ml-auto h-4 w-4 text-primary",
                                            userLang === e.code ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
