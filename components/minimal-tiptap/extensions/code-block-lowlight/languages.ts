/**
 * The languages a doc's code block offers (docs programme B3, editor.md P1-8):
 * the name people know, the grammar's id the block stores (`language`, as
 * ```go writes it), and the words the picker finds it by.
 *
 * The 37 grammars of lowlight's common set load with the first code block
 * (highlighter.ts); the others load the first time a block names one
 * (grammars.ts). Mermaid has no grammar: its block draws the diagram.
 */

export interface CodeLanguage {
  /** What the block stores, and the grammar's name. */
  id: string
  /** What people read: "C#", "Plain text". */
  label: string
  /** More ways to find it: "js", "golang", "sh". */
  aliases?: string[]
}

/** The block draws its text as a diagram (B3, I5: only the source is stored). */
export const MERMAID = "mermaid"

/** No highlighting at all. */
export const PLAIN = "plaintext"

export const CODE_LANGUAGES: CodeLanguage[] = [
  { id: PLAIN, label: "Plain text", aliases: ["text", "txt", "none"] },
  { id: MERMAID, label: "Mermaid", aliases: ["diagram", "flowchart", "graph", "sequence", "chart"] },
  { id: "apache", label: "Apache", aliases: ["httpd", "htaccess"] },
  { id: "arduino", label: "Arduino", aliases: ["ino"] },
  { id: "x86asm", label: "Assembly", aliases: ["asm", "x86", "nasm"] },
  { id: "awk", label: "Awk", aliases: ["gawk"] },
  { id: "bash", label: "Bash", aliases: ["sh", "zsh"] },
  { id: "basic", label: "BASIC" },
  { id: "dos", label: "Batch", aliases: ["bat", "cmd"] },
  { id: "bnf", label: "BNF" },
  { id: "c", label: "C", aliases: ["h"] },
  { id: "csharp", label: "C#", aliases: ["cs", "dotnet"] },
  { id: "cpp", label: "C++", aliases: ["cc", "hpp", "cxx"] },
  { id: "clojure", label: "Clojure", aliases: ["clj", "edn"] },
  { id: "cmake", label: "CMake" },
  { id: "coffeescript", label: "CoffeeScript", aliases: ["coffee"] },
  { id: "coq", label: "Coq" },
  { id: "crystal", label: "Crystal", aliases: ["cr"] },
  { id: "css", label: "CSS" },
  { id: "d", label: "D" },
  { id: "dart", label: "Dart", aliases: ["flutter"] },
  { id: "diff", label: "Diff", aliases: ["patch"] },
  { id: "django", label: "Django", aliases: ["jinja"] },
  { id: "dockerfile", label: "Docker", aliases: ["dockerfile", "containerfile"] },
  { id: "ebnf", label: "EBNF" },
  { id: "elixir", label: "Elixir", aliases: ["ex", "exs"] },
  { id: "elm", label: "Elm" },
  { id: "erlang", label: "Erlang", aliases: ["erl"] },
  { id: "excel", label: "Excel formula", aliases: ["xls", "spreadsheet"] },
  { id: "fsharp", label: "F#", aliases: ["fs"] },
  { id: "fortran", label: "Fortran", aliases: ["f90"] },
  { id: "gherkin", label: "Gherkin", aliases: ["cucumber", "feature"] },
  { id: "glsl", label: "GLSL", aliases: ["shader"] },
  { id: "go", label: "Go", aliases: ["golang"] },
  { id: "gradle", label: "Gradle" },
  { id: "graphql", label: "GraphQL", aliases: ["gql"] },
  { id: "groovy", label: "Groovy" },
  { id: "haml", label: "Haml" },
  { id: "handlebars", label: "Handlebars", aliases: ["hbs", "mustache"] },
  { id: "haskell", label: "Haskell", aliases: ["hs"] },
  { id: "xml", label: "HTML", aliases: ["html", "xml", "svg", "xhtml"] },
  { id: "http", label: "HTTP", aliases: ["https", "request"] },
  { id: "ini", label: "INI and TOML", aliases: ["toml", "cfg", "conf"] },
  { id: "java", label: "Java", aliases: ["jsp"] },
  { id: "javascript", label: "JavaScript", aliases: ["js", "jsx", "node", "mjs"] },
  { id: "json", label: "JSON", aliases: ["jsonc", "json5"] },
  { id: "julia", label: "Julia", aliases: ["jl"] },
  { id: "kotlin", label: "Kotlin", aliases: ["kt", "kts"] },
  { id: "latex", label: "LaTeX", aliases: ["tex"] },
  { id: "less", label: "Less" },
  { id: "lisp", label: "Lisp", aliases: ["elisp", "commonlisp"] },
  { id: "livescript", label: "LiveScript", aliases: ["ls"] },
  { id: "llvm", label: "LLVM IR", aliases: ["ll"] },
  { id: "lua", label: "Lua" },
  { id: "makefile", label: "Makefile", aliases: ["make", "mk"] },
  { id: "markdown", label: "Markdown", aliases: ["md", "mkdown"] },
  { id: "mathematica", label: "Mathematica", aliases: ["wolfram", "mma"] },
  { id: "matlab", label: "MATLAB", aliases: ["octave"] },
  { id: "nginx", label: "Nginx", aliases: ["nginxconf"] },
  { id: "nim", label: "Nim" },
  { id: "nix", label: "Nix", aliases: ["nixos"] },
  { id: "objectivec", label: "Objective-C", aliases: ["objc", "mm"] },
  { id: "ocaml", label: "OCaml", aliases: ["ml"] },
  { id: "delphi", label: "Pascal", aliases: ["delphi", "pas"] },
  { id: "perl", label: "Perl", aliases: ["pl", "pm"] },
  { id: "php", label: "PHP" },
  { id: "pgsql", label: "PostgreSQL", aliases: ["postgres", "plpgsql"] },
  { id: "powershell", label: "PowerShell", aliases: ["ps", "ps1", "pwsh"] },
  { id: "prolog", label: "Prolog" },
  { id: "properties", label: "Properties", aliases: ["java properties"] },
  { id: "protobuf", label: "Protocol Buffers", aliases: ["proto", "protobuf"] },
  { id: "puppet", label: "Puppet", aliases: ["pp"] },
  { id: "python", label: "Python", aliases: ["py", "python3", "gyp"] },
  { id: "python-repl", label: "Python console", aliases: ["pycon", "repl"] },
  { id: "r", label: "R" },
  { id: "ruby", label: "Ruby", aliases: ["rb", "gemspec", "podspec"] },
  { id: "rust", label: "Rust", aliases: ["rs"] },
  { id: "scala", label: "Scala", aliases: ["sc"] },
  { id: "scheme", label: "Scheme", aliases: ["scm", "racket"] },
  { id: "scss", label: "SCSS", aliases: ["sass"] },
  { id: "shell", label: "Shell session", aliases: ["console", "shellsession", "terminal"] },
  { id: "smalltalk", label: "Smalltalk", aliases: ["st"] },
  { id: "sql", label: "SQL", aliases: ["mysql", "sqlite"] },
  { id: "stylus", label: "Stylus", aliases: ["styl"] },
  { id: "swift", label: "Swift" },
  { id: "tcl", label: "Tcl", aliases: ["tk"] },
  { id: "thrift", label: "Thrift" },
  { id: "twig", label: "Twig", aliases: ["craftcms"] },
  { id: "typescript", label: "TypeScript", aliases: ["ts", "tsx", "mts"] },
  { id: "vbnet", label: "VB.NET", aliases: ["vb"] },
  { id: "vbscript", label: "VBScript", aliases: ["vbs", "visual basic"] },
  { id: "verilog", label: "Verilog", aliases: ["v", "sv", "systemverilog"] },
  { id: "vhdl", label: "VHDL" },
  { id: "vim", label: "Vim script", aliases: ["vimscript", "vimrc"] },
  { id: "wasm", label: "WebAssembly", aliases: ["wat", "wast"] },
  { id: "yaml", label: "YAML", aliases: ["yml"] },
]

const byWord = new Map<string, CodeLanguage>()
for (const l of CODE_LANGUAGES) {
  byWord.set(l.id, l)
  for (const a of l.aliases ?? []) if (!byWord.has(a)) byWord.set(a, l)
}

/**
 * The language a word names: an id ("golang" too, and "py"), whatever its
 * case. Undefined for one the list doesn't know; the block keeps it as
 * written and highlights it if lowlight does.
 */
export function languageOf(word: string | null | undefined): CodeLanguage | undefined {
  if (!word) return undefined
  return byWord.get(word.trim().toLowerCase())
}

/** What the block's bar reads for a stored language: its name, or the word as written, or "Auto". */
export function languageLabel(word: string | null | undefined): string {
  if (!word) return "Auto"
  return languageOf(word)?.label ?? word
}
