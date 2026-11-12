import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

/**
 * Renders user-written Markdown with GitHub extensions and TeX math
 * (`$inline$`, `$$display$$`). Raw HTML in the source is not rendered, so
 * statements cannot inject markup or scripts.
 *
 * `assetBase` resolves relative image/link targets, letting a problem
 * statement write `![figure](figure.png)` for one of its attachments.
 */
export function Markdown({ source, assetBase }: { source: string; assetBase?: string }) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        urlTransform={(url) => {
          const safe = defaultUrlTransform(url);
          const relative = assetBase && safe && !/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(safe);
          return relative ? `${assetBase}/${safe.replace(/^\.\//, '')}` : safe;
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
