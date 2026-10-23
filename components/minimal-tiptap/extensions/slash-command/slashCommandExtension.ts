import { Extension } from "@tiptap/core"
import Suggestion from "@tiptap/suggestion"
import { SlashCommandItem, slashCommandSuggestion, CHAT_COMMANDS, withoutChatCommands } from "./slashCommand"
import { inCode } from "../suggestion-popup"

interface SlashCommandOptions {
  commands?: SlashCommandItem[]
  /**
   * The editor writes in a conversation (a message box), so its "/" offers
   * that conversation's commands. Said by the editor, never read from whether
   * it gives its own list: every editor does, and from 12 Oct to 23 Oct that
   * read left every message box with formatting only.
   */
  conversation: boolean
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slash-command",

  // Higher than the default (100) so the suggestion plugin's handleKeyDown is
  // consulted before the composer's Enter-to-send keymap. Combined with the
  // submit handler yielding while the menu is open, this guarantees Enter
  // selects the highlighted command rather than sending the raw "/".
  priority: 200,

  addOptions() {
    return {
      commands: undefined,
      conversation: false,
    }
  },

  addProseMirrorPlugins() {
    const commands = this.options.commands || CHAT_COMMANDS
    const { conversation } = this.options
    const { render } = slashCommandSuggestion

    return [
      Suggestion({
        editor: this.editor,
        char: "/",
        command: ({ editor, range, props }: { editor: any; range: any; props: any }) => {
          props.command({ editor, range })
        },
        items: ({ query, editor }): SlashCommandItem[] => {
          const items = slashCommandSuggestion.items({ query, commands, editor })
          return conversation ? items : withoutChatCommands(items)
        },
        // "/" in code is code ("a/b", a path, a comment), not a menu.
        allow: ({ state, range }) => !inCode(state, range.from),
        render,
      }),
    ]
  },
})

