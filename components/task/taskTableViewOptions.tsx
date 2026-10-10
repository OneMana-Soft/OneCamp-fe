import { DropdownMenuTrigger } from "@radix-ui/react-dropdown-menu";
import { MixerHorizontalIcon } from "@radix-ui/react-icons";
import { Table } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {colName, ColumnId} from "@/types/table";
import {useTranslation} from "react-i18next";

interface DataTableViewOptionsProps<TData> {
    table: Table<TData>;
}

export function TaskTableViewOptions<TData>({
                                                table,
                                            }: DataTableViewOptionsProps<TData>) {
    const {t} = useTranslation()

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                {/* At every width, as Create task is: below sm the icon stays and
                    the word goes. It was hidden below 1024px. */}
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-muted-foreground hover:text-foreground"
                    aria-label={t('view')}
                >
                    <MixerHorizontalIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">{t('view')}</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[150px]">
                <DropdownMenuLabel>{t("toggleColumns")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {table
                    .getAllColumns()
                    .filter(
                        (column) =>
                            typeof column.accessorFn !== "undefined" && column.getCanHide()
                    )
                    .map((column) => {
                        // A project's own field is named as its admins wrote it.
                        const own = (column.columnDef.meta as { label?: string } | undefined)?.label

                        // Sentence case, as the column's own header says it ("Start
                        // date"): a CSS text transform made these "Start Date".
                        const name = colName[column.id as ColumnId] || column.id
                        return (
                            <DropdownMenuCheckboxItem
                                key={column.id}
                                checked={column.getIsVisible()}
                                onCheckedChange={(value) => column.toggleVisibility(!!value)}
                            >
                                {own || name.charAt(0).toUpperCase() + name.slice(1)}
                            </DropdownMenuCheckboxItem>
                        );
                    })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
