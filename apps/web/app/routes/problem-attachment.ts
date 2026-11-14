import { api, load } from '~/lib/api.server';
import { idParam } from '~/lib/params';
import type { Route } from './+types/problem-attachment';

const INLINE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
};

/**
 * Streams a problem attachment through the web server. The API enforces the
 * same visibility as the statement, so hidden problems' files stay hidden.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const file = await load(request, (o) =>
    api.problem.getAttachment({ problemId: idParam(params.id), name: params.name }, o),
  );
  const extension = params.name.split('.').pop()?.toLowerCase() ?? '';
  const inline = INLINE_TYPES[extension];
  return new Response(file.stream(), {
    headers: {
      // Only known-safe types render in the browser; everything else (HTML,
      // SVG, ...) downloads, so uploads cannot run scripts on this origin.
      'Content-Type': inline ?? 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${params.name}"`,
      'Content-Length': String(file.size),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=60',
    },
  });
}
