import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown.server';

describe('renderMarkdown', () => {
  it('renders inline math as MathML', () => {
    const html = renderMarkdown('Given $a^2 + b$ here.');
    expect(html).toMatch(/<p>Given <math[^>]*>.*<msup>.*<\/math> here\.<\/p>/s);
    expect(html).not.toContain('display="block"');
    expect(html).not.toContain('katex');
    expect(html).not.toContain('$');
  });

  it('renders display math as a block inside a scroll container', () => {
    const html = renderMarkdown('$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$');
    expect(html).toMatch(/<div class="math-display"><math[^>]*display="block"/);
    expect(html).toContain('<mfrac>');
    expect(html).not.toContain('<pre>');
  });

  it('treats a one-line $$…$$ paragraph as display math, but not $$…$$ inside a sentence', () => {
    const alone = renderMarkdown('Before.\n\n$$ x^2 + y^2 = z^2 $$\n\nAfter.');
    expect(alone).toMatch(/<p>Before\.<\/p>\s*<div class="math-display"><math[^>]*display="block"/);
    const inSentence = renderMarkdown('We know $$x^2$$ is positive.');
    expect(inSentence).not.toContain('math-display');
    expect(inSentence).toMatch(/<p>We know <math/);
    expect(renderMarkdown('$x^2$')).not.toContain('math-display');
  });

  it('leaves dollars in code alone and keeps GitHub tables', () => {
    const html = renderMarkdown('`$x$` costs\n\n```\n$$y$$\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<code>$x$</code>');
    expect(html).toContain('<pre><code>$$y$$');
    expect(html).toContain('<table>');
    expect(html).not.toContain('<math');
  });

  it('reports malformed TeX inline instead of failing the page', () => {
    const html = renderMarkdown('Broken $\\frac{1$ math and $x$ after.');
    expect(html).toContain('temml-error');
    expect(html).toMatch(/<math[^>]*>.*<mi>x<\/mi>/s);
  });

  it('drops raw HTML, scripts and script URLs', () => {
    const html = renderMarkdown(
      '<script>alert(1)</script>\n\n<img src=x onerror=alert(2)>\n\n[click](javascript:alert(3)) ![p](javascript:alert(4))',
    );
    expect(html).not.toMatch(/<script|onerror|javascript:/i);
    expect(html).toContain('click');
  });

  it('does not let TeX smuggle in links or markup', () => {
    const html = renderMarkdown('$\\href{javascript:alert(1)}{x}$ and $\\text{<img src=x onerror=alert(1)>}$');
    expect(html).not.toMatch(/href=|<img|javascript:[^<]*"/i);
  });

  it('resolves relative images and links against the asset base', () => {
    const html = renderMarkdown('![fig](figure.png) [data](./data.zip) [site](https://example.com) [top](#top) [abs](/x)', {
      assetBase: '/problems/7/attachments',
    });
    expect(html).toContain('src="/problems/7/attachments/figure.png"');
    expect(html).toContain('href="/problems/7/attachments/data.zip"');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('href="#top"');
    expect(html).toContain('href="/x"');
  });

  it('returns an empty string for an empty source', () => {
    expect(renderMarkdown('  \n')).toBe('');
  });
});
