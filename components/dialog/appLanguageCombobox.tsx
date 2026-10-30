import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxField, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox"
import { appLangList, appLanguage } from "@/types/appLanguages"

/** The languages by their names, as people look for them ("English (US)" beside "English (Australia)"). */
const LANGUAGES = Object.values(appLangList).sort((a, b) => a.name.localeCompare(b.name))

interface AppLanguageComboboxProps {
    userLang?: string;
    onLangChange: (c: string) => void;
    /** From <FormControl>: ties the field's label, help and error to the trigger. */
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
}

/**
 * The language field. It sits in a grid of text inputs, so it is the
 * combobox's field (components/ui/combobox): an input's height (44px on a
 * phone, 32px from md up), surface and halo, with the value in the field's
 * normal weight.
 */
export function AppLanguageCombobox({ userLang, onLangChange, ...control }: AppLanguageComboboxProps) {
    const current = appLanguage(userLang)

    return (
        <Combobox>
            <ComboboxField {...control} placeholder="Choose a language">
                {current?.name}
            </ComboboxField>
            <ComboboxContent label="Language" selected={current?.code}>
                <ComboboxInput placeholder="Find a language…" />
                <ComboboxList>
                    <ComboboxEmpty>No language by that name.</ComboboxEmpty>
                    {LANGUAGES.map((e) => (
                        <ComboboxItem key={e.code} value={e.code} keywords={[e.name]} checked={current?.code === e.code} onSelect={onLangChange}>
                            {e.name}
                        </ComboboxItem>
                    ))}
                </ComboboxList>
            </ComboboxContent>
        </Combobox>
    )
}
