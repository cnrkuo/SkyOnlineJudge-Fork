import { createCookie } from 'react-router';

const secret = process.env.SESSION_SECRET;
if (!secret && process.env.NODE_ENV === 'production') {
  throw new Error('SESSION_SECRET must be set in production');
}

/**
 * Holds the API bearer token. It is http-only and signed, so page scripts
 * can neither read nor forge it; SameSite=Lax keeps cross-site POSTs out.
 */
const sessionCookie = createCookie('skyoj_session', {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 24 * 30,
  secrets: [secret ?? 'dev-only-secret'],
});

export async function getToken(request: Request): Promise<string | undefined> {
  const value: unknown = await sessionCookie.parse(request.headers.get('Cookie'));
  return typeof value === 'string' && value ? value : undefined;
}

/** `Set-Cookie` header value that starts a session. */
export const startSession = (token: string) => sessionCookie.serialize(token);

/** `Set-Cookie` header value that ends the session. */
export const endSession = () => sessionCookie.serialize('', { maxAge: 0 });
