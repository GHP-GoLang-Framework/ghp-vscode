// Test for the GHP TextMate grammar.
//
// Loads ghp.tmLanguage.json in the same engine VSCode uses (vscode-textmate
// + oniguruma) and checks the scopes assigned to each chunk. Without this,
// the only way to validate the grammar would be opening the editor and
// looking at the colors.
//
// `source.go` and `text.html.basic` are VSCode built-in grammars, not
// packaged in this extension. Here they are registered as empty stubs —
// this is NOT cosmetic: if an `include` does not resolve, vscode-textmate
// drops the whole rule containing it (the tag stops being recognized
// entirely, with no degradation). The stubs reproduce the real environment,
// where both scopes exist, and keep the test focused on what is ours: the
// recognition of GHP tags and the marking of the
// `meta.embedded.block.go` regions that make VSCode inject real Go.

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const oniguruma = require('vscode-oniguruma');
const textmate = require('vscode-textmate');

const GRAMMAR_PATH = path.join(__dirname, '..', 'syntaxes', 'ghp.tmLanguage.json');

async function loadGrammar() {
  const wasmPath = path.join(
    require.resolve('vscode-oniguruma'),
    '..',
    '..',
    'release',
    'onig.wasm',
  );
  await oniguruma.loadWASM(fs.readFileSync(wasmPath).buffer);

  const registry = new textmate.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (patterns) => new oniguruma.OnigScanner(patterns),
      createOnigString: (s) => new oniguruma.OnigString(s),
    }),
    loadGrammar: async (scopeName) => {
      if (scopeName === 'source.ghp') {
        const raw = fs.readFileSync(GRAMMAR_PATH, 'utf8');
        return textmate.parseRawGrammar(raw, GRAMMAR_PATH);
      }
      // Stubs for the VSCode built-in grammars — see comment at the top.
      if (scopeName === 'source.go' || scopeName === 'text.html.basic') {
        return { scopeName, patterns: [] };
      }
      return null;
    },
  });

  const grammar = await registry.loadGrammar('source.ghp');
  assert.ok(grammar, 'source.ghp grammar did not load');
  return grammar;
}

// tokenize runs the grammar over `source` and returns [{text, scopes}], with
// the line state chained — needed for multi-line tags like <go .../>.
function tokenize(grammar, source) {
  const out = [];
  let ruleStack = textmate.INITIAL;

  for (const line of source.split('\n')) {
    const result = grammar.tokenizeLine(line, ruleStack);
    for (const token of result.tokens) {
      const text = line.substring(token.startIndex, token.endIndex);
      if (text.trim() === '') continue;
      // The text is compared without the surrounding whitespace: the grammar
      // usually returns the Go content together with the space separating it
      // from the tag (e.g.: `<go:if cond/>` produces " cond"), and that space
      // is not relevant.
      out.push({ text: text.trim(), scopes: token.scopes });
    }
    ruleStack = result.ruleStack;
  }
  return out;
}

// assertScope finds the first token whose text matches and requires it to have
// the expected scope.
function assertScope(tokens, text, expectedScope) {
  const token = tokens.find((t) => t.text === text);
  assert.ok(token, `token ${JSON.stringify(text)} not found`);
  assert.ok(
    token.scopes.includes(expectedScope),
    `token ${JSON.stringify(text)} has scopes [${token.scopes.join(', ')}], expected to include ${expectedScope}`,
  );
}

// assertEmbeddedGo requires the chunk to be marked as embedded Go — that is the
// mark VSCode uses to color the content as real Go.
function assertEmbeddedGo(tokens, text) {
  assertScope(tokens, text, 'meta.embedded.block.go');
}

const tests = {
  'recognizes <go:import> and marks the content as Go'(grammar) {
    const tokens = tokenize(grammar, '<go:import ("fmt")/>');
    assertScope(tokens, 'go:import', 'keyword.control.import.ghp');
    assertEmbeddedGo(tokens, '("fmt")');
  },

  'recognizes <go= ...> as echo'(grammar) {
    const tokens = tokenize(grammar, '<title><go= expression /></title>');
    assertScope(tokens, 'go=', 'keyword.control.echo.ghp');
    assertEmbeddedGo(tokens, 'expression');
  },

  'recognizes a multi-line <go .../> block'(grammar) {
    const tokens = tokenize(grammar, '<go\n    items := []string{"a"}\n/>');
    assertScope(tokens, 'go', 'keyword.control.ghp');
    assertEmbeddedGo(tokens, 'items := []string{"a"}');
  },

  'recognizes go:if / go:else / closing tag'(grammar) {
    const tokens = tokenize(
      grammar,
      '<go:if variable == value/>\n  x\n<go:else/>\n  y\n<go:endif/>',
    );
    assertScope(tokens, 'go:if', 'keyword.control.ghp');
    assertEmbeddedGo(tokens, 'variable == value');
    assertScope(tokens, 'go:else', 'keyword.control.ghp');
    // The closing tag appears as its own token, with the same control scope.
    assertScope(tokens, 'go:endif', 'keyword.control.ghp');
  },

  'recognizes go:elif'(grammar) {
    const tokens = tokenize(
      grammar,
      '<go:if a/>\n  x\n<go:elif b/>\n  y\n<go:else/>\n  z\n<go:endif/>',
    );
    assertScope(tokens, 'go:if', 'keyword.control.ghp');
    assertScope(tokens, 'go:elif', 'keyword.control.ghp');
    assertEmbeddedGo(tokens, 'b');
    assertScope(tokens, 'go:else', 'keyword.control.ghp');
    assertScope(tokens, 'go:endif', 'keyword.control.ghp');
  },

  'recognizes switch/case/default'(grammar) {
    const tokens = tokenize(
      grammar,
      '<go:switch variable/>\n<go:case value/>\n<go:default/>\n<go:endswitch/>',
    );
    assertScope(tokens, 'go:switch', 'keyword.control.ghp');
    assertScope(tokens, 'go:case', 'keyword.control.ghp');
    assertScope(tokens, 'go:default', 'keyword.control.ghp');
    assertEmbeddedGo(tokens, 'variable');
  },

  'recognizes go:for'(grammar) {
    const tokens = tokenize(grammar, '<go:for _, item := range items/>\n<go:endfor/>');
    assertScope(tokens, 'go:for', 'keyword.control.ghp');
    assertEmbeddedGo(tokens, '_, item := range items');
  },

  'does not mistake an HTML tag starting with "go" for a Go block'(grammar) {
    const tokens = tokenize(grammar, '<google-maps zoom="3"></google-maps>');
    const wrong = tokens.find((t) => t.scopes.includes('meta.tag.statement.ghp'));
    assert.ok(
      !wrong,
      `<google-maps> was treated as a Go block (token ${JSON.stringify(wrong?.text)})`,
    );
  },

  'does not treat go:import as a control tag'(grammar) {
    const tokens = tokenize(grammar, '<go:import ("fmt")/>');
    const token = tokens.find((t) => t.text === 'go:import');
    assert.ok(
      !token.scopes.includes('meta.tag.control.ghp'),
      'go:import fell into the control tag pattern',
    );
  },

  'processes the whole template.ghp fixture without falling into plain text'(grammar) {
    const templatePath = path.join(__dirname, 'fixtures', 'template.ghp');
    const source = fs.readFileSync(templatePath, 'utf8');
    const tokens = tokenize(grammar, source);

    // Every tag present in the reference template must be recognized.
    for (const tag of [
      'go:import',
      'go=',
      'go:if',
      'go:else',
      'go:endif',
      'go:switch',
      'go:case',
      'go:default',
      'go:endswitch',
      'go:for',
      'go:endfor',
    ]) {
      const found = tokens.find(
        (t) => t.text === tag && t.scopes.some((s) => s.startsWith('keyword.control')),
      );
      assert.ok(found, `tag ${tag} from the reference template was not recognized`);
    }
  },
};

(async () => {
  const grammar = await loadGrammar();
  let failed = 0;

  for (const [name, fn] of Object.entries(tests)) {
    try {
      fn(grammar);
      console.log(`  ok  ${name}`);
    } catch (err) {
      failed++;
      console.error(`FAIL  ${name}\n      ${err.message}`);
    }
  }

  const total = Object.keys(tests).length;
  console.log(`\n${total - failed}/${total} tests passed`);
  process.exit(failed === 0 ? 0 : 1);
})();
