import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { useForm } from "react-hook-form"
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form"
import { AppLanguageCombobox } from "./appLanguageCombobox"

// The language picker sits in the profile's grid of text fields. It was drawn
// as a taller, tinted button with a bold value, its label named nothing, and
// with no language it showed the words "selectedLanguagePlaceholder".

function LanguageField({ value }: { value?: string }) {
  const form = useForm<{ language?: string }>({ defaultValues: { language: value } })
  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="language"
        render={({ field: f }) => (
          <FormItem>
            <FormLabel>Language</FormLabel>
            <FormControl>
              <AppLanguageCombobox userLang={f.value} onLangChange={f.onChange} />
            </FormControl>
          </FormItem>
        )}
      />
    </Form>
  )
}

afterEach(cleanup)

describe("the language field", () => {
  it("is named by its label and shows the language by name", () => {
    render(<LanguageField value="en" />)
    expect(screen.getByRole("combobox", { name: "Language" }).textContent).toContain("English-US")
  })

  it("says what to do when no language is set", () => {
    render(<LanguageField />)
    const picker = screen.getByRole("combobox", { name: "Language" })
    expect(picker.textContent).toContain("Choose a language")
    expect(picker.textContent).not.toContain("selectedLanguagePlaceholder")
  })

  it("is drawn as the text fields beside it", () => {
    render(<LanguageField value="en" />)
    const cls = screen.getByRole("combobox", { name: "Language" }).className
    for (const c of ["h-11", "md:h-9", "border-input", "bg-transparent", "px-3", "font-normal"]) {
      expect(cls.split(/\s+/)).toContain(c)
    }
    expect(cls).not.toMatch(/(^|\s)h-10(\s|$)|bg-muted/)
  })
})
