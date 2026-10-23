import { Extension } from "@tiptap/core"
import Suggestion from "@tiptap/suggestion"
import { SlashCommandItem, slashCommandSuggestion, CHAT_COMMANDS } from "./slashCommand"
import { inCode } from "../suggestion-popup"

/**
 * The chat composer's commands (/remind, /poll, an app's own) are its
 * conversation's (setBackendCommandProvider, per surface). They once reached a
 * doc's "/" beside a thread, and picking one fired it into that composer
 * (how-docs-work N6): only a message box offers them. Pure.
 */
export function withoutChatCommands(items: SlashCommandItem[]): SlashCommandItem[] {
  return items.filter((item) => !item.id.startsWith("cmd-"))
}

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

