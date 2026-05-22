import { Extension } from "@tiptap/core"
import { PluginKey } from "@tiptap/pm/state"
import Suggestion from "@tiptap/suggestion"
import { SlashCommandItem, slashCommandSuggestion, CHAT_COMMANDS } from "./slashCommand"

export const SlashCommandPluginKey = new PluginKey("slash-command")

export const SlashCommand = Extension.create<{ commands?: SlashCommandItem[] }>({
  name: "slash-command",

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
