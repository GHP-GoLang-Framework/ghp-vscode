# GHP — VSCode extension

Syntax highlighting for `.ghp` files: HTML with real embedded Go.

## What it does

- **Syntax highlighting** — plain HTML + the `<go .../>` tags, with the Go inside them colored as real Go
- **Auto-closing** — typing `<go:` or `<go=` inserts the `/>` automatically
- **Snippets** — `go:if`, `go:for`, `go:switch`, `go:import`, and others expand the full block, already with the closing tag (`<go:endif/>`, `<go:endfor/>`, `<go:endswitch/>`)
- **Automatic indentation** inside `<go:if>`, `<go:for>`, and `<go:switch>`

## Recognized tags

Every GHP tag is self-closing (ends with `/>`).

| Tag | What it is |
| --- | --- |
| `<go:import ("fmt")/>` | Page-level Go imports |
| `<go .../>` | Block of Go code (statement), can be multi-line |
| `<go= expression/>` | Renders the expression's value into the HTML |
| `<go:if cond/>` / `<go:else/>` / `<go:endif/>` | Conditional |
| `<go:switch v/>` / `<go:case x/>` / `<go:default/>` / `<go:endswitch/>` | Switch |
| `<go:for expr/>` / `<go:endfor/>` | Loop |

The syntax reference is [`docs/template.ghp`](https://github.com/GHP-GoLang-Framework/ghp/blob/main/docs/template.ghp) in the main [`ghp`](https://github.com/GHP-GoLang-Framework/ghp) repository.

## Installation

Not published to the VS Code Marketplace. Grab the `.vsix` from the [latest release](https://github.com/GHP-GoLang-Framework/ghp-vscode/releases/latest) and install it:

```bash
code --install-extension ghp-<version>.vsix
```

Or, in VSCode: Extensions view → **"..."** menu → **Install from VSIX...**

## Development

```bash
npm install
npm test        # runs the grammar against real cases and validates the scopes
```

To test in the editor: open this folder in VSCode and press `F5` — opens a window with the extension loaded. Open any `.ghp` file to see the highlighting.

To package: `npx @vscode/vsce package`.

## Releasing

Bump `version` in `package.json`, commit, then tag and push:

```bash
git tag v$(node -p "require('./package.json').version")
git push --tags
```

The `Release` workflow packages the extension and attaches the `.vsix` to a GitHub Release.

## Known limitations

**`>` operator inside tags.** The tag closes on the first `>`, so a condition like `<go:if a > b/>` is highlighted incorrectly (the highlight ends at the operator's `>`). This is not an extension bug but an ambiguity of the syntax itself, which needs to be resolved in the parser — in the meantime, `>=` and `>` in conditions can be written as `<go:if b < a/>` or moved into a previous `<go .../>` block.

**Dependency on the Go grammar.** Highlighting the tag content depends on the `source.go` grammar, which ships with VSCode. If for any reason it is unavailable, the GHP tags stop being recognized altogether (TextMate drops the whole rule when an `include` does not resolve — there is no partial degradation).

**No LSP.** There is no Go symbol autocomplete, "go to definition", or diagnostics inside the tags. That would require a language server that understands the `.ghp` → generated Go mapping — a natural next step once the parser and codegen exist.
