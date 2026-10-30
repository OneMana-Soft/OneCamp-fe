import { useTranslation } from "@/lib/utils/i18n"
import { FilterChip } from "@/components/task/filterChip"
import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
    ComboboxSeparator,
    ComboboxTrigger,
} from "@/components/ui/combobox"
import {priorities} from "@/types/table";
import {TaskPriorityCell} from "@/components/task/taskPriorityCell";

type TaskCardProps = {
    activeList: string[];
    updateList: (l: string[])=>void;
};

/** The board's priority filter: tasks at any of the priorities ticked. */
export function TaskKanbanColumnPriorityFilter({ activeList, updateList}: TaskCardProps) {
    const { t } = useTranslation()

    return (
        <Combobox multiple>
            <ComboboxTrigger asChild>
                <FilterChip title={t("priority")} count={activeList.length} selected={priorities.filter((o) => activeList.includes(o.value)).map((o) => t(o.value, { defaultValue: o.label }))} />
            </ComboboxTrigger>
            <ComboboxContent label={t("priority")}>
                <ComboboxInput placeholder={t('priority')} />
                <ComboboxList>
                    <ComboboxEmpty>{t('noResultFound')}</ComboboxEmpty>
                    {priorities.map((option) => {
                        const isSelected = activeList.includes(option.value);
                        return (
                            <ComboboxItem
                                key={option.value}
                                value={option.value}
                                keywords={[t(option.value, { defaultValue: option.label })]}
                                checked={isSelected}
                                onSelect={() => updateList(isSelected ? activeList.filter((item) => item !== option.value) : [...activeList, option.value])}
                            >
                                <TaskPriorityCell priority={option}/>
                            </ComboboxItem>
                        );
                    })}
                    {activeList.length > 0 && (
                        <>
                            <ComboboxSeparator />
                            <ComboboxItem value="__clear__" keywords={[t('clearPriority')]} onSelect={() => updateList([])} className="justify-center text-center">
                                {t('clearPriority')}
                            </ComboboxItem>
                        </>
                    )}
                </ComboboxList>
            </ComboboxContent>
        </Combobox>
    );
}
