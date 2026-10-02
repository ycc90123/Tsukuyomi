#!/usr/bin/env bun
/**
 * Tsukuyomi Novel Scraper (輕小說抓取工具)
 * 
 * 功能：
 * 從 Kakuyomu (kakuyomu.jp)、小說家になろう (ncode.syosetu.com / novel18.syosetu.com / syosetu.org)
 * 抓取小說目錄與章節，並直接生成符合 Tsukuyomi Skill 的目錄結構：
 *   <output-dir>/
 *   ├── meta.yaml          (小說與卷/章目錄元資料)
 *   ├── characters.yaml    (空角色表或初始角色)
 *   ├── glossary.yaml      (空術語庫)
 *   ├── memories.yaml      (空記憶庫)
 *   ├── raw/               (各章原文純文字)
 *   └── translated/        (準備放置翻譯對照的空目錄)
 * 
 * 用法：
 *   bun scrape.ts "<url>" [output-dir] [--limit N] [--start M] [--delay ms]
 */

import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';
import { NovelScraperFactory } from '../../../../src/services/scraper/novel-scraper-factory';

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').trim();
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    console.log(`
使用方式:
  bun scrape.ts "<URL>" [output-dir] [選項]

選項:
  --limit <N>     僅抓取前 N 個章節 (預設全部)
  --start <M>     從第 M 個章節開始抓取 (1-based, 預設 1)
  --delay <ms>    每章抓取間隔延遲毫秒數 (預設 600ms，避免被網站封鎖)

支援網站:
  - kakuyomu.jp (カクヨム)
  - ncode.syosetu.com (小説家になろう)
  - novel18.syosetu.com (小説家になろう R18)
  - syosetu.org (ハーメルン)
`);
    process.exit(0);
  }

  const url = args[0];
  let customOutDir: string | undefined;
  let limit: number | undefined;
  let startChapter: number = 1;
  let delayMs: number = 600;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--start' && args[i + 1]) {
      startChapter = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--delay' && args[i + 1]) {
      delayMs = parseInt(args[i + 1], 10);
      i++;
    } else if (!args[i].startsWith('--') && !customOutDir) {
      customOutDir = args[i];
    }
  }

  const scraper = NovelScraperFactory.getScraper(url);
  if (!scraper) {
    console.error(`[錯誤] 找不到支援此網址的爬蟲: ${url}`);
    process.exit(1);
  }

  console.log(`[1/3] 正在解析小說首頁資訊與目錄: ${url}`);
  const result = await scraper.fetchNovel(url);
  if (!result.success || !result.novel) {
    console.error(`[錯誤] 解析失敗: ${result.error}`);
    process.exit(1);
  }

  const novel = result.novel;
  const novelOrigTitle = typeof novel.title === 'string'
    ? novel.title
    : (novel.title?.original || 'untitled_novel');
  const novelTransTitle = typeof novel.title === 'object' && novel.title?.translation?.translation
    ? novel.title.translation.translation
    : '';

  const safeFolderName = sanitizeFilename(novelTransTitle ? `${novelOrigTitle}_${novelTransTitle}` : novelOrigTitle);
  const outDir = customOutDir
    ? path.resolve(process.cwd(), customOutDir)
    : path.resolve(process.cwd(), 'novels', safeFolderName);

  console.log(`[2/3] 建立小說目錄結構: ${outDir}`);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const rawDir = path.join(outDir, 'raw');
  const transDir = path.join(outDir, 'translated');
  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(transDir, { recursive: true });

  // 初始化 characters.yaml (若已存在則保留)
  const charPath = path.join(outDir, 'characters.yaml');
  if (!fs.existsSync(charPath)) {
    const defaultChars = (novel.characterSettings || []).map((c: any, i: number) => ({
      id: c.id || `char-${i + 1}`,
      name: c.name || '',
      translation: c.translation?.translation || '',
      sex: c.sex || 'unknown',
      speakingStyle: c.speakingStyle || '',
      description: c.description || '',
      aliases: (c.aliases || []).map((a: any) => typeof a === 'string' ? a : a.name || '')
    }));
    fs.writeFileSync(charPath, YAML.stringify(defaultChars), 'utf-8');
  }

  // 初始化 glossary.yaml (若已存在則保留)
  const glossPath = path.join(outDir, 'glossary.yaml');
  if (!fs.existsSync(glossPath)) {
    const defaultTerms = (novel.terminologies || []).map((t: any, i: number) => ({
      id: t.id || `term-${i + 1}`,
      name: t.name || '',
      translation: t.translation?.translation || '',
      category: t.category || '',
      description: t.description || ''
    }));
    fs.writeFileSync(glossPath, YAML.stringify(defaultTerms), 'utf-8');
  }

  // 初始化 memories.yaml (若已存在則保留)
  const memPath = path.join(outDir, 'memories.yaml');
  if (!fs.existsSync(memPath)) {
    fs.writeFileSync(memPath, YAML.stringify([]), 'utf-8');
  }

  // 抓取章節內容並建立 meta.yaml
  console.log(`[3/3] 正在下載章節內文...`);
  const metaVolumes: any[] = [];
  let globalChapIdx = 0;
  let fetchedCount = 0;

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
      const currentIdx = globalChapIdx;

      const chapOrigTitle = typeof chap.title === 'string'
        ? chap.title
        : (chap.title?.original || `Chapter ${currentIdx}`);
      const chapTransTitle = typeof chap.title === 'object' && chap.title?.translation?.translation
        ? chap.title.translation.translation
        : '';

      const padIdx = String(currentIdx).padStart(3, '0');
      const safeChapName = sanitizeFilename(chapOrigTitle);
      const baseFilename = `ch${padIdx}_${safeChapName}`;

      metaVol.chapters.push({
        id: chap.id || `chap-${currentIdx}`,
        filename: baseFilename,
        title: {
          original: chapOrigTitle,
          translation: chapTransTitle
        },
        webUrl: chap.webUrl || ''
      });

      // 檢查是否符合抓取範圍
      if (currentIdx < startChapter) {
        continue;
      }
      if (limit !== undefined && fetchedCount >= limit) {
        continue;
      }

      const chapterRawFile = path.join(rawDir, `${baseFilename}.txt`);
      // 若已有檔案且內容不為空，跳過以避免重複抓取
      if (fs.existsSync(chapterRawFile) && fs.statSync(chapterRawFile).size > 0) {
        console.log(`  - 章節 ${currentIdx} 已存在，跳過: ${chapOrigTitle}`);
        fetchedCount++;
        continue;
      }

      if (!chap.webUrl) {
        console.warn(`  - [警告] 章節 ${currentIdx} 沒有 webUrl，跳過: ${chapOrigTitle}`);
        continue;
      }

      console.log(`  - 下載第 ${currentIdx} 章: ${chapOrigTitle}`);
      try {
        const rawHtmlOrText = await scraper.fetchChapterContent(chap.webUrl);
        const lines = rawHtmlOrText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        fs.writeFileSync(chapterRawFile, lines.join('\n'), 'utf-8');
        fetchedCount++;
        if (delayMs > 0) {
          await sleep(delayMs);
        }
      } catch (err: any) {
        console.error(`  - [錯誤] 下載第 ${currentIdx} 章失敗:`, err?.message || err);
      }
    }

    metaVolumes.push(metaVol);
  }

  // 儲存 meta.yaml
  const meta = {
    id: novel.id || String(Date.now()),
    title: {
      original: novelOrigTitle,
      translation: novelTransTitle
    },
    author: novel.author || '',
    description: novel.description || '',
    sourceUrl: url,
    tags: novel.tags || [],
    coverUrl: novel.cover || novel.coverUrl || '',
    volumes: metaVolumes
  };
  fs.writeFileSync(path.join(outDir, 'meta.yaml'), YAML.stringify(meta), 'utf-8');

  console.log(`\n========================================`);
  console.log(`抓取完成！`);
  console.log(`- 書名: ${novelOrigTitle}`);
  console.log(`- 儲存位置: ${outDir}`);
  console.log(`- 總章節數: ${globalChapIdx}`);
  console.log(`- 本次成功抓取: ${fetchedCount} 章`);
  console.log(`- 角色庫: ${charPath}`);
  console.log(`- 術語庫: ${glossPath}`);
  console.log(`========================================\n`);
}

main().catch(err => {
  console.error('[Fatal Error]:', err);
  process.exit(1);
});
