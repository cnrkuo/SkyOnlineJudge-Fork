import type { Language } from '@skyoj/contract';
import type { Root } from 'hast';
import { createCssVariablesTheme, createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';

/**
 * Syntax highlighting with Shiki, on the server only. Loaders call
 * `highlight()` and send finished HTML; no highlighter, grammar or theme is
 * part of the browser bundle.
 *
 * The theme does not contain colours. It emits CSS variables
 * (`--shiki-token-keyword`, …) which `ui/code.css.ts` binds to the design
 * tokens, so code uses the same palette as the rest of the interface.
 */

const theme = createCssVariablesTheme({ name: 'skyoj', variablePrefix: '--shiki-', fontStyle: true });

/** Grammars are loaded once, on first use. */
let highlighter: Promise<HighlighterCore> | undefined;
function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    themes: [theme],
    langs: [
      import('shiki/langs/c.mjs'),
      import('shiki/langs/cpp.mjs'),
      import('shiki/langs/python.mjs'),
      import('shiki/langs/java.mjs'),
      import('shiki/langs/javascript.mjs'),
      import('shiki/langs/typescript.mjs'),
      import('shiki/langs/rust.mjs'),
      import('shiki/langs/go.mjs'),
      import('shiki/langs/json.mjs'),
      import('shiki/langs/shellscript.mjs'),
    ],
    // The Oniguruma engine (WebAssembly) is the one TextMate grammars are
    // written for. Shiki's pure-JavaScript engine cannot run every pattern
    // of the C++ grammar and leaves function bodies uncoloured.
    engine: createOnigurumaEngine(import('shiki/wasm')),
  });
  return highlighter;
}

/** Names authors write after ``` in Markdown, and the judge's language ids. */
const ALIASES: Record<string, string> = {
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  cc: 'cpp',
  py: 'python',
  py3: 'python',
  python: 'python',
  python3: 'python',
  java: 'java',
  js: 'javascript',
  javascript: 'javascript',
  ts: 'typescript',
  typescript: 'typescript',
  rust: 'rust',
  rs: 'rust',
  go: 'go',
  json: 'json',
  sh: 'shellscript',
  bash: 'shellscript',
  shell: 'shellscript',
};

const resolve = (language: string | undefined) => (language && ALIASES[language.toLowerCase()]) || 'text';

/** Highlights source code to HTML (`<pre class="shiki"><code>…`). */
export async function highlight(code: string, language: Language | string | undefined): Promise<string> {
  const shiki = await getHighlighter();
  return shiki.codeToHtml(code.replace(/\n$/, ''), { lang: resolve(language), theme: 'skyoj' });
}

/** Same, as a syntax tree — used when splicing code blocks into Markdown. */
export async function highlightToHast(code: string, language: string | undefined): Promise<Root> {
  const shiki = await getHighlighter();
  return shiki.codeToHast(code.replace(/\n$/, ''), { lang: resolve(language), theme: 'skyoj' }) as Root;
}
