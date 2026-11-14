import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown.server';

describe('renderMarkdown', () => {
  it('renders inline math as MathML', async () => {
    const html = await renderMarkdown('Given $a^2 + b$ here.');
    expect(html).toMatch(/<p>Given <math[^>]*>.*<msup>.*<\/math> here\.<\/p>/s);
    expect(html).not.toContain('display="block"');
    expect(html).not.toContain('katex');
    expect(html).not.toContain('$');
  });

  it('renders display math as a block inside a scroll container', async () => {
    const html = await renderMarkdown('$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$');
    expect(html).toMatch(/<div class="math-display"><math[^>]*display="block"/);
    expect(html).toContain('<mfrac>');
    expect(html).not.toContain('<pre>');
  });

  it('treats a one-line $$…$$ paragraph as display math, but not $$…$$ inside a sentence', async () => {
    const alone = await renderMarkdown('Before.\n\n$$ x^2 + y^2 = z^2 $$\n\nAfter.');
    expect(alone).toMatch(/<p>Before\.<\/p>\s*<div class="math-display"><math[^>]*display="block"/);
    const inSentence = await renderMarkdown('We know $$x^2$$ is positive.');
    expect(inSentence).not.toContain('math-display');
    expect(inSentence).toMatch(/<p>We know <math/);
    expect(await renderMarkdown('$x^2$')).not.toContain('math-display');
  });

  it('leaves dollars in code alone and keeps GitHub tables', async () => {
    const html = await renderMarkdown('`$x$` costs\n\n```\n$$y$$\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<code>$x$</code>');
    expect(html).toMatch(/<pre class="shiki[^>]*>.*\$\$y\$\$/s);
    expect(html).toContain('<table>');
    expect(html).not.toContain('<math');
  });

  it('highlights fenced code with Shiki using theme variables, not fixed colours', async () => {
    const html = await renderMarkdown('```cpp\nint main() { return 0; } // done\n```');
    expect(html).toContain('class="shiki');
    expect(html).toContain('var(--shiki-token-keyword)');
    expect(html).toContain('var(--shiki-token-comment)');
    expect(html).not.toMatch(/color:\s*#[0-9a-f]{3,8}/i);
    // Unknown languages fall back to plain text instead of failing.
    expect(await renderMarkdown('```brainfuck\n+++\n```')).toContain('+++');
  });

  it('reports malformed TeX inline instead of failing the page', async () => {
    const html = await renderMarkdown('Broken $\\frac{1$ math and $x$ after.');
    expect(html).toContain('temml-error');
    expect(html).toMatch(/<math[^>]*>.*<mi>x<\/mi>/s);
  });

  it('drops raw HTML, scripts and script URLs', async () => {
    const html = await renderMarkdown(
      '<script>alert(1)</script>\n\n<img src=x onerror=alert(2)>\n\n[click](javascript:alert(3)) ![p](javascript:alert(4))',
    );
    expect(html).not.toMatch(/<script|onerror|javascript:/i);
    expect(html).toContain('click');
  });

  it('does not let TeX smuggle in links or markup', async () => {
    const html = await renderMarkdown('$\\href{javascript:alert(1)}{x}$ and $\\text{<img src=x onerror=alert(1)>}$');
    expect(html).not.toMatch(/href=|<img|javascript:[^<]*"/i);
  });

  it('resolves relative images and links against the asset base', async () => {
    const html = await renderMarkdown(
      '![fig](figure.png) [data](./data.zip) [site](https://example.com) [top](#top) [abs](/x)',
      {
        assetBase: '/problems/7/attachments',
      },
    );
    expect(html).toContain('src="/problems/7/attachments/figure.png"');
    expect(html).toContain('href="/problems/7/attachments/data.zip"');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('href="#top"');
    expect(html).toContain('href="/x"');
  });

  it('returns an empty string for an empty source', async () => {
    expect(await renderMarkdown('  \n')).toBe('');
  });
});
