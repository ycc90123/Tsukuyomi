#!/usr/bin/env bun
/**
 * Tsukuyomi Bridge (雙向轉換工具)
 * 
 * 功能：
 * 1. unpack: 將 Tsukuyomi 網頁版匯出的巨型 JSON 解構成人類與 Agent 友善的目錄結構：
 *    - meta.yaml (小說與章節元資料)
 *    - characters.yaml (角色設定表)
 *    - glossary.yaml (術語庫)
 *    - memories.yaml (文風與記憶庫)
 *    - raw/ (逐章日文原文純文字)
 *    - translated/ (逐章雙欄對照 Markdown 表格)
 * 
 * 2. pack: 將上述目錄結構重新打包為標準 Tsukuyomi JSON，供網頁版直接匯入。
 * 
 * 用法：
 *   bun tsukuyomi-bridge.ts unpack <path-to-novel.json> [output-dir]
 *   bun tsukuyomi-bridge.ts pack <path-to-novel-dir> [output-json-path]
 */

import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';

// ==========================================
// 輔助工具函數
// ==========================================

function generateShortId(): string {
  return Math.random().toString(16).substring(2, 10);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').trim();
}

function escapeTableCell(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r\n/g, '<br>')
    .replace(/\n/g, '<br>');
}

function unescapeTableCell(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\\\|/g, '|')
    .replace(/\\\\/g, '\\')
    .trim();
}

/**
 * 解析 Markdown 表格行，正確處理反斜槓轉義的管道符
 */
function parseTableRow(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) {
    return null;
  }

  // 去除首尾的 |
  const inner = trimmed.slice(1, -1);
  const cells: string[] = [];
  let current = '';
  let escaped = false;

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (escaped) {
      current += ch;
      escaped = false;
    } else if (ch === '\\') {
      current += ch;
      escaped = true;
    } else if (ch === '|') {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);

  if (cells.length < 2) return null;
  return [unescapeTableCell(cells[0]), unescapeTableCell(cells[1])];
}

// ==========================================
// UNPACK: JSON -> 目錄與 YAML
// ==========================================

export async function unpackNovel(jsonPath: string, targetDir?: string) {
  const fullJsonPath = path.resolve(process.cwd(), jsonPath);
  if (!fs.existsSync(fullJsonPath)) {
    throw new Error(`找不到 JSON 檔案: ${fullJsonPath}`);
  }

  console.log(`[Unpack] 讀取 JSON: ${fullJsonPath}`);
  const rawData = fs.readFileSync(fullJsonPath, 'utf-8');
  const data = JSON.parse(rawData);
  const novel = data.novel || data;

  const rawOrigTitle = typeof novel.title === 'string'
    ? novel.title
    : (novel.title?.original || novel.id || 'untitled_novel');
  const rawTransTitle = typeof novel.title === 'object' && novel.title?.translation?.translation
    ? novel.title.translation.translation
    : '';

  const folderName = sanitizeFilename(rawTransTitle ? `${rawOrigTitle}_${rawTransTitle}` : rawOrigTitle);
  const outDir = targetDir
    ? path.resolve(process.cwd(), targetDir)
    : path.resolve(path.dirname(fullJsonPath), folderName);

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const rawDir = path.join(outDir, 'raw');
  const transDir = path.join(outDir, 'translated');
  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(transDir, { recursive: true });

  // 1. 處理 characters.yaml
  const characters = (novel.characterSettings || []).map((c: any) => ({
    id: c.id || `char-${generateShortId()}`,
    name: c.name || '',
    translation: c.translation?.translation || '',
    sex: c.sex || 'unknown',
    speakingStyle: c.speakingStyle || '',
    description: c.description || '',
    aliases: (c.aliases || []).map((a: any) => (typeof a === 'string' ? a : a.name || '')).filter(Boolean)
  }));
  fs.writeFileSync(path.join(outDir, 'characters.yaml'), YAML.stringify(characters), 'utf-8');

  // 2. 處理 glossary.yaml
  const glossary = (novel.terminologies || []).map((t: any) => ({
    id: t.id || `term-${generateShortId()}`,
    name: t.name || '',
    translation: t.translation?.translation || '',
    category: t.category || '',
    description: t.description || ''
  }));
  fs.writeFileSync(path.join(outDir, 'glossary.yaml'), YAML.stringify(glossary), 'utf-8');

  // 3. 處理 memories.yaml
  const memories = (novel.memories || []).map((m: any) => ({
    id: m.id || `mem-${generateShortId()}`,
    summary: m.summary || '',
    content: m.content || ''
  }));
  fs.writeFileSync(path.join(outDir, 'memories.yaml'), YAML.stringify(memories), 'utf-8');

  // 4. 處理章節與 volumes
  const metaVolumes: any[] = [];
  let globalChapIdx = 0;
  let totalParagraphs = 0;
  let translatedParagraphs = 0;

  const volumes = novel.volumes || [];
  for (let vIdx = 0; vIdx < volumes.length; vIdx++) {
    const vol = volumes[vIdx];
    const volOrigTitle = typeof vol.title === 'string'
      ? vol.title
      : (vol.title?.original || `Volume ${vIdx + 1}`);
    const volTransTitle = typeof vol.title === 'object' && vol.title?.translation?.translation
      ? vol.title.translation.translation
      : '';

    const metaVol: any = {
      id: vol.id || `vol-${vIdx + 1}`,
      title: {
        original: volOrigTitle,
        translation: volTransTitle
      },
      chapters: []
    };

    const chapters = vol.chapters || [];
    for (const chap of chapters) {
      globalChapIdx++;
      const chapOrigTitle = typeof chap.title === 'string'
        ? chap.title
        : (chap.title?.original || `Chapter ${globalChapIdx}`);
      const chapTransTitle = typeof chap.title === 'object' && chap.title?.translation?.translation
        ? chap.title.translation.translation
        : '';

      const padIdx = String(globalChapIdx).padStart(3, '0');
      const safeChapName = sanitizeFilename(chapOrigTitle);
      const baseFilename = `ch${padIdx}_${safeChapName}`;

      metaVol.chapters.push({
        id: chap.id || `chap-${globalChapIdx}`,
        filename: baseFilename,
        title: {
          original: chapOrigTitle,
          translation: chapTransTitle
        },
        webUrl: chap.webUrl || ''
      });

      const paragraphs = chap.content || [];
      const rawLines: string[] = [];
      const tableRows: string[] = [];
      let chapHasTranslation = false;

      for (const p of paragraphs) {
        const rawJp = p.text || '';
        rawLines.push(rawJp);
        totalParagraphs++;

        const transObj = p.translations && p.translations.length > 0
          ? (p.selectedTranslationId
              ? p.translations.find((t: any) => t.id === p.selectedTranslationId) || p.translations[0]
              : p.translations[0])
          : null;

        const transZh = transObj?.translation || '';
        if (transZh.trim()) {
          chapHasTranslation = true;
          translatedParagraphs++;
        }

        tableRows.push(`| ${escapeTableCell(rawJp)} | ${escapeTableCell(transZh)} |`);
      }

      // 儲存 raw/<baseFilename>.txt
      fs.writeFileSync(path.join(rawDir, `${baseFilename}.txt`), rawLines.join('\n'), 'utf-8');

      // 儲存 translated/<baseFilename>.md
      const headerTitle = chapTransTitle ? `${chapOrigTitle} / ${chapTransTitle}` : chapOrigTitle;
      let mdText = `# ${headerTitle}\n\n`;
      mdText += `| 日文原文 | 繁體中文譯文 |\n`;
      mdText += `| :--- | :--- |\n`;
      mdText += tableRows.join('\n') + '\n';
      fs.writeFileSync(path.join(transDir, `${baseFilename}.md`), mdText, 'utf-8');
    }

    metaVolumes.push(metaVol);
  }

  // 5. 儲存 meta.yaml
  const meta = {
    id: novel.id || generateShortId(),
    title: {
      original: rawOrigTitle,
      translation: rawTransTitle
    },
    author: novel.author || '',
    description: novel.description || '',
    sourceUrl: novel.sourceUrl || novel.webUrl || '',
    tags: novel.tags || [],
    coverUrl: novel.cover || novel.coverUrl || '',
    volumes: metaVolumes
  };
  fs.writeFileSync(path.join(outDir, 'meta.yaml'), YAML.stringify(meta), 'utf-8');

  console.log(`[Unpack 完成]`);
  console.log(`- 輸出目錄: ${outDir}`);
  console.log(`- 卷數: ${metaVolumes.length}，總章節數: ${globalChapIdx}`);
  console.log(`- 段落數: ${totalParagraphs} (已翻譯: ${translatedParagraphs})`);
  console.log(`- 角色數: ${characters.length}，術語數: ${glossary.length}，記憶數: ${memories.length}`);
  return outDir;
}

// ==========================================
// PACK: 目錄與 YAML -> Tsukuyomi JSON
// ==========================================

export async function packNovel(novelDir: string, targetJsonPath?: string) {
  const fullDir = path.resolve(process.cwd(), novelDir);
  if (!fs.existsSync(fullDir)) {
    throw new Error(`找不到目錄: ${fullDir}`);
  }

  const metaPath = path.join(fullDir, 'meta.yaml');
  if (!fs.existsSync(metaPath)) {
    throw new Error(`目錄內缺少 meta.yaml: ${metaPath}`);
  }

  console.log(`[Pack] 讀取目錄: ${fullDir}`);
  const meta = YAML.parse(fs.readFileSync(metaPath, 'utf-8'));

  // 讀取 characters.yaml
  let characterSettings: any[] = [];
  const charPath = path.join(fullDir, 'characters.yaml');
  if (fs.existsSync(charPath)) {
    const chars = YAML.parse(fs.readFileSync(charPath, 'utf-8')) || [];
    characterSettings = chars.map((c: any) => ({
      id: c.id || `char-${generateShortId()}`,
      name: c.name || '',
      sex: c.sex || 'unknown',
      speakingStyle: c.speakingStyle || '',
      description: c.description || '',
      translation: {
        id: `trans-${c.id || generateShortId()}`,
        translation: c.translation || '',
        aiModelId: 'opencode-agent'
      },
      aliases: (c.aliases || []).map((a: any, i: number) => ({
        id: `alias-${i + 1}`,
        name: typeof a === 'string' ? a : a.name || ''
      }))
    }));
  }

  // 讀取 glossary.yaml
  let terminologies: any[] = [];
  const glossPath = path.join(fullDir, 'glossary.yaml');
  if (fs.existsSync(glossPath)) {
    const terms = YAML.parse(fs.readFileSync(glossPath, 'utf-8')) || [];
    terminologies = terms.map((t: any) => ({
      id: t.id || `term-${generateShortId()}`,
      name: t.name || '',
      description: t.description || '',
      category: t.category || '',
      translation: {
        id: `trans-${t.id || generateShortId()}`,
        translation: t.translation || '',
        aiModelId: 'opencode-agent'
      }
    }));
  }

  // 讀取 memories.yaml
  let memories: any[] = [];
  const memPath = path.join(fullDir, 'memories.yaml');
  if (fs.existsSync(memPath)) {
    const mems = YAML.parse(fs.readFileSync(memPath, 'utf-8')) || [];
    memories = mems.map((m: any) => ({
      id: m.id || `mem-${generateShortId()}`,
      bookId: meta.id,
      content: m.content || '',
      summary: m.summary || '',
      createdAt: Date.now(),
      lastAccessedAt: Date.now()
    }));
  }

  // 讀取章節內容並組裝 volumes
  const rawDir = path.join(fullDir, 'raw');
  const transDir = path.join(fullDir, 'translated');

  const volumes: any[] = [];
  let totalChapters = 0;
  let totalParagraphs = 0;
  let translatedParagraphs = 0;

  for (const vol of (meta.volumes || [])) {
    const assembledChapters: any[] = [];

    for (const chap of (vol.chapters || [])) {
      totalChapters++;
      const baseFilename = chap.filename;
      const mdPath = path.join(transDir, `${baseFilename}.md`);
      const txtPath = path.join(rawDir, `${baseFilename}.txt`);

      let paragraphs: any[] = [];
      let chapterTitleOrig = chap.title?.original || '';
      let chapterTitleZh = chap.title?.translation || '';

      if (fs.existsSync(mdPath)) {
        // 從 translated/ 讀取雙欄 Markdown 表格
        const mdRaw = fs.readFileSync(mdPath, 'utf-8');
        const lines = mdRaw.split('\n');

        // 嘗試從 # 標題提取譯名
        const h1 = lines.find(l => l.startsWith('# '));
        if (h1) {
          const titleContent = h1.replace('# ', '').trim();
          if (titleContent.includes(' / ')) {
            const parts = titleContent.split(' / ');
            chapterTitleOrig = parts[0].trim();
            chapterTitleZh = parts[1].trim();
          } else {
            chapterTitleOrig = titleContent;
          }
        }

        let inTable = false;
        let pIndex = 0;

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('|')) continue;
          if (trimmed.includes('---')) {
            inTable = true;
            continue;
          }
          if (trimmed.includes('日文原文') && trimmed.includes('繁體中文譯文')) {
            continue;
          }
          if (!inTable) continue;

          const parsed = parseTableRow(line);
          if (!parsed) continue;

          const [jp, zh] = parsed;
          if (!jp && !zh) continue;

          pIndex++;
          totalParagraphs++;
          const pId = `p-${pIndex}`;
          const transId = `trans-${pIndex}`;

          if (zh) {
            translatedParagraphs++;
            paragraphs.push({
              id: pId,
              text: jp,
              selectedTranslationId: transId,
              translations: [
                {
                  id: transId,
                  translation: zh,
                  aiModelId: 'opencode-agent'
                }
              ]
            });
          } else {
            paragraphs.push({
              id: pId,
              text: jp,
              selectedTranslationId: '',
              translations: []
            });
          }
        }
      } else if (fs.existsSync(txtPath)) {
        // 只有 raw txt
        const txtRaw = fs.readFileSync(txtPath, 'utf-8');
        const lines = txtRaw.split('\n');
        let pIndex = 0;
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          pIndex++;
          totalParagraphs++;
          paragraphs.push({
            id: `p-${pIndex}`,
            text: trimmed,
            selectedTranslationId: '',
            translations: []
          });
        }
      }

      assembledChapters.push({
        id: chap.id || `chap-${totalChapters}`,
        title: {
          original: chapterTitleOrig,
          translation: {
            id: `trans-title-${chap.id || totalChapters}`,
            translation: chapterTitleZh,
            aiModelId: 'opencode-agent'
          }
        },
        webUrl: chap.webUrl || '',
        contentLoaded: true,
        content: paragraphs
      });
    }

    volumes.push({
      id: vol.id || `vol-${volumes.length + 1}`,
      title: {
        original: vol.title?.original || '',
        translation: {
          id: `trans-vol-${volumes.length + 1}`,
          translation: vol.title?.translation || '',
          aiModelId: 'opencode-agent'
        }
      },
      chapters: assembledChapters
    });
  }

  // 組裝完整的 Tsukuyomi 數據結構
  const novelTitleOrig = meta.title?.original || '';
  const novelTitleZh = meta.title?.translation || '';

  const finalNovel = {
    id: meta.id || generateShortId(),
    title: {
      original: novelTitleOrig,
      translation: {
        id: 'trans-novel-title',
        translation: novelTitleZh,
        aiModelId: 'opencode-agent'
      }
    },
    author: meta.author || '',
    description: meta.description || '',
    webUrl: meta.sourceUrl || '',
    tags: meta.tags || [],
    cover: meta.coverUrl || '',
    createdAt: Date.now(),
    lastEdited: Date.now(),
    characterSettings,
    terminologies,
    memories,
    volumes
  };

  const finalOutput = {
    novel: finalNovel
  };

  const outJsonPath = targetJsonPath
    ? path.resolve(process.cwd(), targetJsonPath)
    : path.resolve(process.cwd(), `${sanitizeFilename(novelTitleZh || novelTitleOrig || 'novel')}.json`);

  const outJsonDir = path.dirname(outJsonPath);
  if (!fs.existsSync(outJsonDir)) {
    fs.mkdirSync(outJsonDir, { recursive: true });
  }

  fs.writeFileSync(outJsonPath, JSON.stringify(finalOutput, null, 2), 'utf-8');

  console.log(`[Pack 完成]`);
  console.log(`- 輸出 JSON: ${outJsonPath}`);
  console.log(`- 卷數: ${volumes.length}，總章節數: ${totalChapters}`);
  console.log(`- 段落數: ${totalParagraphs} (已翻譯: ${translatedParagraphs})`);
  console.log(`- 角色數: ${characterSettings.length}，術語數: ${terminologies.length}，記憶數: ${memories.length}`);
  return outJsonPath;
}

// ==========================================
// CLI 入口
// ==========================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || (command !== 'unpack' && command !== 'pack')) {
    console.log(`
使用方式:
  bun tsukuyomi-bridge.ts unpack <path-to-novel.json> [output-dir]
  bun tsukuyomi-bridge.ts pack <path-to-novel-dir> [output-json-path]

說明:
  unpack: 將網頁版巨型 JSON 解構成 meta.yaml, characters.yaml, glossary.yaml, raw/, translated/
  pack:   將解構後的章節與 YAML 重新打包回 Tsukuyomi 標準 JSON，供網頁版匯入
`);
    process.exit(1);
  }

  const targetPath = args[1];
  const outPath = args[2];

  if (!targetPath) {
    console.error(`錯誤: 請指定目標路徑！`);
    process.exit(1);
  }

  if (command === 'unpack') {
    await unpackNovel(targetPath, outPath);
  } else if (command === 'pack') {
    await packNovel(targetPath, outPath);
  }
}

if (import.meta.main) {
  main().catch(err => {
    console.error('執行失敗:', err);
    process.exit(1);
  });
}
