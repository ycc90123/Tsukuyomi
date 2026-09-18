import { NovelScraperFactory } from '../../src/services/scraper/novel-scraper-factory';
import * as fs from 'fs';
import * as path from 'path';
import type { Novel, Paragraph } from '../../src/models/novel';

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: bun scripts/skill-helpers/scrape-novel.ts <url>');
    process.exit(1);
  }

  const factory = new NovelScraperFactory();
  const scraper = factory.getScraper(url);
  if (!scraper) {
    console.error(`No scraper found for URL: ${url}`);
    process.exit(1);
  }

  console.log(`Scraping novel info from: ${url}`);
  const result = await scraper.fetchNovel(url);
  if (!result.success || !result.novel) {
    console.error(`Failed to scrape novel: ${result.error}`);
    process.exit(1);
  }

  const novel: Novel = result.novel;
  novel.characterSettings = novel.characterSettings || [];
  novel.terminologies = novel.terminologies || [];

  // If chapters have no content loaded yet, fetch contents for each chapter
  let chapterCount = 0;
  if (novel.volumes) {
    for (const vol of novel.volumes) {
      if (vol.chapters) {
        for (const chap of vol.chapters) {
          chapterCount++;
          if (chap.webUrl && (!chap.content || chap.content.length === 0)) {
            console.log(`Fetching chapter ${chapterCount}: ${typeof chap.title === 'string' ? chap.title : chap.title.original}`);
            try {
              const rawText = await scraper.fetchChapterContent(chap.webUrl);
              const lines = rawText.split('\n').filter(l => l.trim().length > 0);
              chap.content = lines.map((line, idx) => ({
                id: `p-${idx + 1}`,
                text: line,
                selectedTranslationId: '',
                translations: []
              }));
              chap.contentLoaded = true;
            } catch (err) {
              console.error(`Failed to fetch chapter content from ${chap.webUrl}:`, err);
            }
          }
        }
      }
    }
  }

  const outDir = path.resolve(process.cwd(), 'tsukuyomi-data/novels');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const filePath = path.join(outDir, `${novel.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(novel, null, 2), 'utf-8');
  console.log(`Successfully scraped novel and saved to: ${filePath}`);
}

main().catch(err => {
  console.error('Fatal error during scraping:', err);
  process.exit(1);
});
