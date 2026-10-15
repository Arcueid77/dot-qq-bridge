import fs from 'node:fs';
import path from 'node:path';

export function checkDocumentation() {
  const documents = ['README.md', 'README.en.md', 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.en.md'];
  for (const root of ['docs', 'plugin', 'tools/tunnel-stack', 'packages/dot-bridge-tunnel']) {
    if (!fs.existsSync(root)) continue;
    documents.push(...fs.readdirSync(root, { recursive: true })
      .filter(file => file.endsWith('.md')).map(file => path.join(root, file).replaceAll('\\', '/')));
  }
  const manifest = JSON.parse(fs.readFileSync('docs/languages.json', 'utf8'));
  if (manifest.default_language !== 'zh-CN' || !Array.isArray(manifest.pages)) throw new Error('Invalid documentation language manifest');
  const paired = new Set();
  for (const pair of manifest.pages) {
    if (Object.keys(pair).sort().join(',') !== 'en,zh-CN' ||
        pair.en !== pair['zh-CN'].replace(/\.md$/, '.en.md')) throw new Error('Invalid documentation language pair');
    for (const file of Object.values(pair)) {
      if (!documents.includes(file) || paired.has(file)) throw new Error('Missing or duplicate language page: ' + file);
      paired.add(file);
      const content = fs.readFileSync(file, 'utf8');
      for (const [locale, label] of [['zh-CN', '简体中文'], ['en', 'English']]) {
        const target = path.relative(path.dirname(file), pair[locale]).replaceAll('\\', '/');
        if (!content.includes('[' + label + '](' + target + ')')) throw new Error('Missing language switch in ' + file);
      }
    }
  }
  for (const file of documents) {
    if (!paired.has(file)) throw new Error('Current document lacks a language pair: ' + file);
    const raw = fs.readFileSync(file, 'utf8');
    if (/\{\{CODE:\d+\}\}/.test(raw)) throw new Error('Unexpanded code block in ' + file);
    const content = raw.replace(/^```[^\n]*\n[\s\S]*?^```[ \t]*$/gm, '');
    for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) continue;
      if (!fs.existsSync(path.resolve(path.dirname(file), target))) throw new Error('Broken local link in ' + file + ': ' + target);
    }
  }
  process.stdout.write('Checked ' + manifest.pages.length + ' bilingual pairs and local links in ' + documents.length + ' Markdown files.\n');
}
