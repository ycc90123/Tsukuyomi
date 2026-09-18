import * as fs from 'fs';
import * as path from 'path';

function main() {
  const args = process.argv.slice(2);
  const jsonPath = args[0];
  const chapterIndexArg = args[1]; // 1-based index (global chapter index across volumes) or chapter ID

  if (!jsonPath || !chapterIndexArg) {
    console.error('Usage: bun .opencode/skills/tsukuyomi-translator/scripts/export-chapter-md.ts <path-to-novel.json> <chapter-number-or-id>');
    process.exit(1);
  }

  const fullPath = path.resolve(process.cwd(), jsonPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`Error: File not found at ${fullPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(fullPath, 'utf-8');
  const data = JSON.parse(raw);
  const novel = data.novel || data;

  let targetChap: any = null;
  let currentChapIdx = 0;
  const targetIdx = parseInt(chapterIndexArg, 10);

  if (novel.volumes) {
    for (const vol of novel.volumes) {
      if (vol.chapters) {
        for (const chap of vol.chapters) {
          currentChapIdx++;
          if (!isNaN(targetIdx) && currentChapIdx === targetIdx) {
            targetChap = chap;
            break;
          } else if (chap.id === chapterIndexArg) {
            targetChap = chap;
            break;
          }
        }
      }
      if (targetChap) break;
    }
  }

  if (!targetChap) {
    console.error(`Error: Chapter ${chapterIndexArg} not found in novel.`);
    process.exit(1);
  }

  const origTitle = typeof targetChap.title === 'string' 
    ? targetChap.title 
    : (targetChap.title?.original || '未命名章節');
  
  const transTitleObj = typeof targetChap.title === 'object' && targetChap.title?.translation
    ? targetChap.title.translation
    : null;
  const transTitle = transTitleObj ? transTitleObj.translation : '';

  const headerTitle = transTitle ? `${origTitle} / ${transTitle}` : origTitle;
  
  let mdContent = `# ${headerTitle}\n\n`;
  mdContent += `| 日文原文 | 繁體中文譯文 |\n`;
  mdContent += `| :--- | :--- |\n`;

  const paragraphs = targetChap.content || [];
  let exportCount = 0;

  for (const p of paragraphs) {
    const rawJp = p.text || '';
    const trimmedJp = rawJp.trim();
    if (!trimmedJp) continue; // Skip empty spacing lines

    const transObj = p.translations && p.translations.length > 0
      ? (p.selectedTranslationId ? p.translations.find((t: any) => t.id === p.selectedTranslationId) || p.translations[0] : p.translations[0])
      : null;

    const rawZh = transObj ? transObj.translation : '';
    
    // 強制轉義換行符與管道符，防止 Markdown 表格破裂
    const safeJp = rawJp
      .replace(/\|/g, '\\|')
      .replace(/\r\n/g, '<br>')
      .replace(/\n/g, '<br>');

    const safeZh = rawZh
      .replace(/\|/g, '\\|')
      .replace(/\r\n/g, '<br>')
      .replace(/\n/g, '<br>');

    mdContent += `| ${safeJp} | ${safeZh} |\n`;
    exportCount++;
  }

  const outDir = path.resolve(process.cwd(), 'tsukuyomi-data/exports');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const sanitizeName = origTitle.replace(/[/\\?%*:|"<>]/g, '_');
  const outFile = path.join(outDir, `第${targetIdx || currentChapIdx}話_${sanitizeName}.md`);
  
  fs.writeFileSync(outFile, mdContent, 'utf-8');
  console.log(`Successfully exported ${exportCount} paragraphs to: ${outFile}`);
}

main();
