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
import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import { ProjectTile } from "@/components/ui/graphics/ProjectTile";

interface KanbanProjectFilterProps {
  activeList: string[];
  updateList: (l: string[])=>void;
}

/** The board's project filter: tasks in any of the projects ticked. */
export function TaskKanbanProjectFilter({ activeList, updateList }: KanbanProjectFilterProps) {
  const { t } = useTranslation()
  const selfUserProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const projects = selfUserProfile.data?.data.user_projects ?? []

  return (
    <Combobox multiple>
      <ComboboxTrigger asChild>
        <FilterChip title={t("project")} count={activeList.length} selected={projects.filter((o) => activeList.includes(o.uid)).map((o) => o.project_name)} />
      </ComboboxTrigger>
      <ComboboxContent label={t("project")}>
        <ComboboxInput placeholder={t('project')} />
        <ComboboxList>
          <ComboboxEmpty>{t('noResultFound')}</ComboboxEmpty>
          {projects.map((option) => {
            const isSelected = activeList.includes(option.uid);
            return (
              // By its id, found by its name: two projects may share one.
              <ComboboxItem
                key={option.uid}
                value={option.uid}
                keywords={[option.project_name]}
                checked={isSelected}
                onSelect={() => updateList(isSelected ? activeList.filter((item) => item !== option.uid) : [...activeList, option.uid])}
              >
                <ProjectTile id={option.project_uuid} />
                <span className="min-w-0 truncate">{option.project_name}</span>
              </ComboboxItem>
            );
          })}
          {activeList.length > 0 && (
            <>
              <ComboboxSeparator />
              <ComboboxItem value="__clear__" keywords={[t('clearProjects')]} onSelect={() => updateList([])} className="justify-center text-center">
                {t('clearProjects')}
              </ComboboxItem>
            </>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
