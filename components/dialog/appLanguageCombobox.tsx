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
}

export function AppLanguageCombobox({ userLang, onLangChange }: AppLanguageComboboxProps) {
    const [open, setOpen] = useState(false)

    return (
        <div className='flex gap-x-3 w-full'>

            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-full justify-between font-normal h-10 bg-muted/20 border-border/40 hover:bg-muted/40 hover:border-border/60 hover:shadow-sm transition-all duration-300 rounded-xl px-4"
                    >
                        <span className="truncate text-sm font-medium">
                            {userLang &&appLangList[userLang]
                                ? appLangList[userLang].name
                                : ('selectedLanguagePlaceholder')}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-40"/>
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 shadow-xl border-border/50 rounded-xl overflow-hidden" align="start">
                    <Command className="bg-popover">
                        <CommandInput placeholder="Search language..." className="h-9 border-none focus:ring-0 shadow-none" />
                        <CommandList className="max-h-[200px] overflow-y-auto">
                            <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">No language found.</CommandEmpty>
                            <CommandGroup>
                                {Object.values(appLangList).map((e) => (<CommandItem
                                            key={e.code}
                                            value={e.code}
                                            onSelect={() => {
                                                setOpen(false)
                                                if (onLangChange) {
                                                    onLangChange(e.code)
                                                }
                                            }}
                                            className="cursor-pointer p-2 rounded-lg m-1 gap-3 aria-selected:bg-primary/5 transition-colors duration-200"
                                        >
                                        <span className="flex-1 font-semibold text-sm">{e.name}</span>
                                        <Check
                                            className={cn(
                                                "ml-auto h-4 w-4 text-primary",
                                                userLang === e.code? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>

        </div>

)
}

