// Liste tout ce qui reste à rédiger ou à vérifier → docs/A_COMPLETER.md
// Usage : node docs/lister-a-completer.mjs
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIRS = ['src/content', 'data'];
const PATTERNS = [/\[À COMPLÉTER : ([^\]]+)\]/g, /\[À VÉRIFIER : ([^\]]+)\]/g, /<FigureTodo>([^<]+)<\/FigureTodo>/g];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(mdx?|csv)$/.test(name)) out.push(p);
  }
  return out;
}

const groups = new Map();
let total = 0;
for (const d of DIRS) {
  for (const file of walk(join(ROOT, d))) {
    const text = readFileSync(file, 'utf8');
    const items = [];
    for (const re of PATTERNS) for (const m of text.matchAll(re)) items.push((re.source.startsWith('<') ? '🖼️ Figure : ' : re.source.includes('VÉRIFIER') ? '🔎 ' : '') + m[1].trim());
    if (!items.length) continue;
    const rel = relative(ROOT, file).replaceAll('\\', '/');
    const section = rel.split('/').slice(0, rel.startsWith('src/content') ? 3 : 2).join('/');
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section).push({ rel, items });
    total += items.length;
  }
}

const lines = ['# À rédiger ou à vérifier\n', `*Liste générée le ${new Date().toLocaleDateString('fr-FR')} par \`node docs/lister-a-completer.mjs\` — ${total} éléments.*\n`,
  'Les versions arabe et anglaise reprennent les mêmes points (« traduction … ») : rédiger d\'abord le français.\n'];
for (const [section, files] of [...groups].sort()) {
  lines.push(`## ${section}\n`);
  for (const f of files) {
    if (/\/(ar|en)\//.test(f.rel) && f.items.every((i) => /traduction|translation/.test(i))) {
      lines.push(`- \`${f.rel}\` : ${f.items.length} section(s) à traduire`);
      continue;
    }
    lines.push(`### \`${f.rel}\`\n`);
    for (const i of f.items) lines.push(`- [ ] ${i}`);
    lines.push('');
  }
  lines.push('');
}
writeFileSync(join(ROOT, 'docs', 'A_COMPLETER.md'), lines.join('\n'), 'utf8');
console.log(`${total} éléments → docs/A_COMPLETER.md`);
