import { Extension } from "@tiptap/core"
import { PluginKey } from "@tiptap/pm/state"
import Suggestion from "@tiptap/suggestion"
import { SlashCommandItem, slashCommandSuggestion, CHAT_COMMANDS } from "./slashCommand"

export const SlashCommandPluginKey = new PluginKey("slash-command")

export const SlashCommand = Extension.create<{ commands?: SlashCommandItem[] }>({
  name: "slash-command",

  // Higher than the default (100) so the suggestion plugin's handleKeyDown is
  // consulted before the composer's Enter-to-send keymap. Combined with the
  // submit handler yielding while the menu is open, this guarantees Enter
  // selects the highlighted command rather than sending the raw "/".
  priority: 200,

  addOptions() {
    return {
      commands: undefined,
    }
  },

  addProseMirrorPlugins() {
    const commands = this.options.commands || CHAT_COMMANDS
    const { render } = slashCommandSuggestion

    return [
      Suggestion({
        editor: this.editor,
        char: "/",
        command: ({ editor, range, props }: { editor: any; range: any; props: any }) => {
          props.command({ editor, range })
        },
        items: ({ query }: { query: string }): SlashCommandItem[] => {
          return slashCommandSuggestion.items({ query, commands })
        },
        render,
      }),
    ]
  },
})

export default SlashCommand
