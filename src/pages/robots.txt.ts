import type { APIRoute } from 'astro';

/** robots.txt : tout est indexable sauf l'interface d'édition ; lien vers le plan du site. */
export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL('sitemap-index.xml', site).href;
  const body = ['User-agent: *', 'Allow: /', 'Disallow: /admin/', '', `Sitemap: ${sitemap}`, ''].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
