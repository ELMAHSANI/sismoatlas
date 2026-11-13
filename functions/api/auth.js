/**
 * Decap CMS — début de la connexion GitHub (Cloudflare Pages Function, gratuite).
 * Variables à définir dans Cloudflare Pages (Settings > Environment variables) :
 *   GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET (secret) — application OAuth GitHub, adresse de retour :
 *   https://<site>/api/callback
 * Le cookie posé ici ne concerne que les éditeurs (protection contre la falsification de la connexion).
 */
export async function onRequestGet({ request, env }) {
  if (!env.GITHUB_CLIENT_ID) return new Response('GITHUB_CLIENT_ID manquant', { status: 500 });
  const url = new URL(request.url);
  const state = crypto.randomUUID();
  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', `${url.origin}/api/callback`);
  authorize.searchParams.set('scope', url.searchParams.get('scope') || 'public_repo');
  authorize.searchParams.set('state', state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.href,
      'Set-Cookie': `decap_oauth_state=${state}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}
