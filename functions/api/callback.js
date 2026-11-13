/**
 * Decap CMS — retour de GitHub : échange le code contre un jeton et le transmet à la fenêtre de Decap
 * (protocole « authorizing:github » / « authorization:github:success » de Decap CMS).
 */
function page(status, content) {
  const message = `authorization:github:${status}:${JSON.stringify(content)}`;
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>SismoAtlas</title><script>
      (function () {
        function receive(e) {
          window.opener.postMessage(${JSON.stringify(message)}, e.origin);
          window.removeEventListener('message', receive, false);
        }
        window.addEventListener('message', receive, false);
        window.opener.postMessage('authorizing:github', '*');
      })();
    </script>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': 'decap_oauth_state=; Path=/api; Max-Age=0' } },
  );
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookie = (request.headers.get('Cookie') || '').match(/decap_oauth_state=([^;]+)/)?.[1];
  if (!code || !state || state !== cookie) return page('error', { message: 'Connexion refusée (état invalide).' });

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'SismoAtlas-CMS' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/api/callback`,
    }),
  });
  const data = await res.json();
  if (!data.access_token) return page('error', { message: data.error_description || 'Échec de la connexion GitHub.' });
  return page('success', { token: data.access_token, provider: 'github' });
}
