// Garde-fou avant publication : un contenu publié (draft: false) ne doit plus contenir de marqueur
// « [À COMPLÉTER : …] », « [À VÉRIFIER : …] » ni de <FigureTodo>. Utilisé par la CI sur chaque Pull Request.
// Usage : node scripts/check-content.mjs   (code de sortie 1 en cas de problème)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONTENT = join(ROOT, 'src', 'content');
const MARKERS = /\[À COMPLÉTER|\[À VÉRIFIER|<FigureTodo/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.mdx?$/.test(name)) out.push(p);
  }
  return out;
}

const problems = [];
for (const file of walk(CONTENT)) {
  const text = readFileSync(file, 'utf8');
  const front = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  if (/^draft:\s*true\s*$/m.test(front)) continue; // brouillon : autorisé
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (MARKERS.test(line)) problems.push(`${relative(ROOT, file).replaceAll('\\', '/')}:${i + 1}  ${line.trim().slice(0, 100)}`);
  });
}

if (problems.length) {
  console.error(`✗ ${problems.length} marqueur(s) dans des contenus publiés (draft: false) :\n`);
  console.error(problems.join('\n'));
  console.error('\nCompléter ces passages, ou laisser le contenu en brouillon (draft: true).');
  process.exit(1);
}
console.log('✓ Aucun marqueur « à compléter » dans les contenus publiés.');
