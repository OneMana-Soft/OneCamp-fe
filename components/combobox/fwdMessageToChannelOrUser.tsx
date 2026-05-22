import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";
import {Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList} from "@/components/ui/command";
import {Button} from "@/components/ui/button";
import { Check, ChevronsUpDown } from "@/lib/icons";
import {useState} from "react";
import {cn} from "@/lib/utils/helpers/cn";

const frameworks = [
  {
    value: "next.js",
    label: "Next.js",
  },
  {
    value: "sveltekit",
    label: "SvelteKit",
  },
  {
    value: "nuxt.js",
    label: "Nuxt.js",
  },
  {
    value: "remix",
    label: "Remix",
  },
  {
    value: "astro",
    label: "Astro",
  },
]

export const FwdMessageToChannelOrUser = (message: string) => {

    const [open, setOpen] = useState(false)
    const [value, setValue] = useState("")

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox" 
                    aria-expanded={open}
                    className="w-[220px] justify-between font-normal h-10 bg-muted/20 border-border/40 hover:bg-muted/40 hover:border-border/60 hover:shadow-sm transition-all duration-300 rounded-xl px-4"
                >
                    <span className="truncate text-sm font-medium">
                        {value
                            ? frameworks.find((framework) => framework.value === value)?.label
                            : "Select framework..."}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-40" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[240px] p-0 shadow-xl border-border/50 rounded-xl overflow-hidden">
                <Command className="bg-popover">
                    <CommandInput placeholder="Search framework..." className="h-9 border-none focus:ring-0 shadow-none" />
                    <CommandList className="max-h-[200px] overflow-y-auto">
                        <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">No framework found.</CommandEmpty>
                        <CommandGroup>
                            {frameworks.map((framework) => (
                                <CommandItem
                                    key={framework.value}
                                    value={framework.value}
                                    onSelect={(currentValue) => {
                                        setValue(currentValue === value ? "" : currentValue)
                                        setOpen(false)
                                    }}
                                    className="cursor-pointer p-2 rounded-lg m-1 gap-3 aria-selected:bg-primary/5 transition-colors duration-200"
                                >
                                    <span className="flex-1 font-medium text-sm">{framework.label}</span>
                                    <Check
                                        className={cn(
                                            "ml-auto h-4 w-4 text-primary",
                                            value === framework.value ? "opacity-100" : "opacity-0"
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