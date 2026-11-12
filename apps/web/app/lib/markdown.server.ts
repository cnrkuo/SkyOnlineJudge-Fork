import type { Element, ElementContent, Root } from 'hast';
import type { Root as MdastRoot } from 'mdast';
import { fromHtml } from 'hast-util-from-html';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import temml from 'temml';
import { unified } from 'unified';
import { SKIP, visit } from 'unist-util-visit';
import { code as codeClass } from '~/ui/code.css';
import { highlightToHast } from './highlight.server';
import type { VFile } from 'vfile';

/**
 * Server-side Markdown rendering. Statements, contest descriptions and
 * scoreboard announcements are turned into HTML here, in the loaders; the
 * browser receives finished markup and no rendering library at all.
 *
 * Math (`$inline$`, `$$display$$`) becomes MathML, which browsers lay out
 * natively — no script, stylesheet or font has to be shipped for it.
 * Fenced code blocks are highlighted with Shiki, also here.
 *
 * Safety: raw HTML in the source is dropped, the generated tree is
 * sanitized (GitHub's allow-list: no scripts, event handlers or
 * `javascript:` URLs), and only then are the generated parts inserted: MathML
 * produced by Temml from the TeX and code markup produced by Shiki — neither
 * is taken from the author.
 */

const hasClass = (node: Element, name: string) =>
  Array.isArray(node.properties.className) && node.properties.className.includes(name);

const textOf = (node: Element): string =>
  node.children.map((child) => (child.type === 'text' ? child.value : child.type === 'element' ? textOf(child) : '')).join('');

/**
 * Markdown only treats `$$` as display math when the dollars sit on lines
 * of their own. Authors routinely write `$$ x^2 $$` as a one-line paragraph
 * and expect a displayed equation, so promote exactly that case: a paragraph
 * consisting of nothing but one `$$…$$`.
 */
function remarkDisplayMath() {
  return (tree: MdastRoot, file: VFile) => {
    const source = String(file.value);
    visit(tree, 'paragraph', (node, index, parent) => {
      const [only] = node.children;
      if (!parent || index === undefined || node.children.length !== 1 || only?.type !== 'inlineMath') return;
      const start = only.position?.start.offset;
      if (start === undefined || !source.startsWith('$$', start)) return;
      parent.children[index] = {
        type: 'math',
        value: only.value,
        position: node.position,
        // The same shape remark-math gives fenced display math.
        data: {
          hName: 'pre',
          hChildren: [
            {
              type: 'element',
              tagName: 'code',
              properties: { className: ['language-math', 'math-display'] },
              children: [{ type: 'text', value: only.value }],
            },
          ],
        },
      };
    });
  };
}

/** TeX → MathML elements. Malformed TeX renders as an inline error message. */
function toMathML(tex: string, displayMode: boolean): ElementContent[] {
  const mathml = temml.renderToString(tex, {
    displayMode,
    throwOnError: false,
    // Authors are not trusted with \href, \includegraphics and friends.
    trust: false,
    // Bound macro expansion so a hostile statement cannot stall the server.
    maxExpand: 1000,
    maxSize: [20, 20],
  });
  return fromHtml(mathml, { fragment: true }).children as ElementContent[];
}

/**
 * remark-math leaves `<code class="language-math">` behind: inline for
 * `$…$`, wrapped in `<pre>` for `$$…$$`. Replace both with MathML.
 */
function rehypeMathML() {
  return (tree: Root) => {
    visit(tree, 'element', (node, index, parent) => {
      if (!parent || index === undefined) return;
      const display = node.tagName === 'pre' ? node.children.find((child) => child.type === 'element') : undefined;
      const code = display?.type === 'element' ? display : node;
      if (code.tagName !== 'code' || !hasClass(code, 'language-math')) return;
      // An inline `code` whose parent is the display `pre` was handled above.
      if (code === node && parent.type === 'element' && parent.tagName === 'pre') return;

      const mathml = toMathML(textOf(code), code !== node);
      parent.children.splice(index, 1, ...(code !== node ? [wrapDisplay(mathml)] : mathml));
      return [SKIP, index + 1];
    });
  };
}

/** Wide display equations scroll inside their own box instead of the page. */
function wrapDisplay(children: ElementContent[]): Element {
  return { type: 'element', tagName: 'div', properties: { className: ['math-display'] }, children };
}

/**
 * Replaces fenced code blocks (`<pre><code class="language-x">`) with
 * Shiki's highlighted markup, wrapped like every other code view.
 */
function rehypeHighlight() {
  return async (tree: Root) => {
    const blocks: { parent: Element | Root; index: number; code: Element }[] = [];
    visit(tree, 'element', (node, index, parent) => {
      const child = node.tagName === 'pre' ? node.children.find((c) => c.type === 'element') : undefined;
      if (!parent || index === undefined || child?.type !== 'element' || child.tagName !== 'code') return;
      if (hasClass(child, 'language-math')) return;
      blocks.push({ parent, index, code: child });
      return SKIP;
    });
    for (const { parent, index, code } of blocks) {
      const names = Array.isArray(code.properties.className) ? code.properties.className.map(String) : [];
      const language = names.find((name) => name.startsWith('language-'))?.slice('language-'.length);
      const highlighted = await highlightToHast(textOf(code), language);
      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { className: [codeClass] },
        children: highlighted.children as ElementContent[],
      };
    }
  };
}

const isRelative = (url: string) => !/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(url);

/**
 * Resolves relative image and link targets against `assetBase`, so a
 * problem statement can write `![figure](figure.png)` for an attachment.
 */
function rehypeAssetBase(assetBase: string | undefined) {
  return (tree: Root) => {
    if (!assetBase) return;
    visit(tree, 'element', (node) => {
      const attribute = node.tagName === 'img' ? 'src' : node.tagName === 'a' ? 'href' : undefined;
      const value = attribute && node.properties[attribute];
      if (attribute && typeof value === 'string' && value && isRelative(value)) {
        node.properties[attribute] = `${assetBase}/${value.replace(/^\.\//, '')}`;
      }
    });
  };
}

export async function renderMarkdown(source: string, options: { assetBase?: string } = {}): Promise<string> {
  if (!source.trim()) return '';
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDisplayMath)
    .use(remarkRehype) // raw HTML is not carried over
    .use(rehypeSanitize)
    .use(rehypeAssetBase, options.assetBase)
    .use(rehypeHighlight)
    .use(rehypeMathML)
    .use(rehypeStringify)
    .process(source);
  return String(file);
}
