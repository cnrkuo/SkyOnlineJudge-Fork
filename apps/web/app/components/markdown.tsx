import { prose } from '~/styles/prose.css';

/**
 * Shows Markdown that a loader has already rendered with `renderMarkdown`
 * (`~/lib/markdown.server`). The HTML is sanitized there, which is what
 * makes injecting it here safe; never pass anything else to this component.
 */
export function Markdown({ html }: { html: string }) {
  return <div className={prose} dangerouslySetInnerHTML={{ __html: html }} />;
}
