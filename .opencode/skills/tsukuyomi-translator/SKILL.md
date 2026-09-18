---
name: tsukuyomi-translator
description: AI-driven Japanese light novel translation, scraping, polishing, proofreading, character/terminology management, and plot memory orchestration in Traditional Chinese. Use when the user requests downloading, managing, translating, polishing, or organizing light novels, chapters, terminology, character settings, or plot memories.
license: Apache-2.0
compatibility: OpenCode environment with Bun installed
metadata:
  author: tsukuyomi
  version: "1.0"
---

# Tsukuyomi Translator — OpenCode Agent Skill

This skill allows OpenCode Agent to operate as the complete end-to-end engine for Japanese Light Novel translation, management, scraping, and refining, outputting 100% **Traditional Chinese (繁體中文)**.

All novel data is stored per-book in `tsukuyomi-data/novels/<novel-id>.json`.

---

## Capabilities & Workflows

1. **Scrape Novel (`scrape`)**: Fetch novel metadata and all chapter texts directly from `ncode.syosetu.com`, `kakuyomu.jp`, `syosetu.org`, or `novel18.syosetu.com`.
2. **Setup Knowledge Base (`characters` & `terms`)**: Create and maintain character settings (speaking style, aliases, gender) and terminology glossaries for consistent translation.
3. **Translate Chapter (`translate`)**: Perform high-quality chapter translation from Japanese to Traditional Chinese paragraph-by-paragraph using Tsukuyomi prompt rules.
4. **Polish & Proofread (`polish` / `proofread`)**: Eliminate translationese (擺脫翻譯腔), refine tone/speaking styles, and check for typos/punctuation errors.
5. **Export Chapter to Markdown (`export-md`)**: Export translated chapter to a Markdown file formatted as a 2-column table (Left: Japanese original, Right: Traditional Chinese translation).
6. **Memory Orchestration (`memory`)**: Extract and update long-context story plot memories per book to ensure deep consistency across 100+ chapters.

---

## Detailed Step-by-Step Instructions

### Step 1: Scraping a Novel
When given a novel URL (e.g. Kakuyomu or Syosetu):
1. Execute the helper script via Bash:
   ```bash
   bun .opencode/skills/tsukuyomi-translator/scripts/scrape-novel.ts "<URL>"
   ```
2. The script will save the JSON structure to `tsukuyomi-data/novels/<novel-id>.json`.
3. Read `tsukuyomi-data/novels/<novel-id>.json` using the `read` tool to inspect title, volume count, and chapter list.

---

### Step 2: Managing Characters & Terminology
Before translating or during translation:
1. Open `tsukuyomi-data/novels/<novel-id>.json`.
2. Check `characterSettings` and `terminologies`.
3. If new characters or terms are identified:
   - Add them to `characterSettings[]`:
     ```json
     {
       "id": "char-<shortid>",
       "name": "日文原名",
       "sex": "female",
       "description": "描述",
       "speakingStyle": "口癖/語氣",
       "translation": { "id": "t1", "translation": "繁體中文譯名", "aiModelId": "opencode-agent" },
       "aliases": []
     }
     ```
   - Add to `terminologies[]`:
     ```json
     {
       "id": "term-<shortid>",
       "name": "日文專有名詞",
       "description": "解釋",
       "translation": { "id": "t1", "translation": "繁體中文譯名", "aiModelId": "opencode-agent" }
     }
     ```
4. Update the JSON file using `write` or `edit`.

---

### Step 3: Translating a Chapter
When asked to translate a specific chapter:
1. Read the target novel JSON `tsukuyomi-data/novels/<novel-id>.json`.
2. Locate the target chapter inside `volumes[].chapters[]`.
3. Extract current `characterSettings`, `terminologies`, and `memories`.
4. Load translation prompts from `.opencode/skills/tsukuyomi-translator/references/PROMPTS_GUIDE.md`.
5. For each paragraph in `chapter.content`:
   - Apply translation prompt rules (1:1 alignment, Traditional Chinese, full punctuation compliance, honorifics/styles).
   - Generate a new `Translation` entry:
     ```json
     {
       "id": "<short-hex>",
       "translation": "繁體中文譯文",
       "aiModelId": "opencode-agent"
     }
     ```
   - Push to `paragraph.translations` and set `paragraph.selectedTranslationId` to the new ID.
6. Translate chapter title if not already translated.
7. Save updated novel JSON back to `tsukuyomi-data/novels/<novel-id>.json`.

---

### Step 4: Polishing & Proofreading
When asked to polish or proofread translated chapters:
1. Read `tsukuyomi-data/novels/<novel-id>.json`.
2. Apply Polish or Proofread prompt rules from `PROMPTS_GUIDE.md`.
3. Create an updated `Translation` entry for each paragraph, appending it to `paragraph.translations[]` and updating `selectedTranslationId`.
4. Save the novel JSON back.

---

### Step 5: Exporting Chapter to Markdown Table
When asked to export a chapter as Markdown or a 2-column table:
1. Execute the helper script via Bash:
   ```bash
   bun .opencode/skills/tsukuyomi-translator/scripts/export-chapter-md.ts "tsukuyomi-data/novels/<novel-id>.json" <chapter-number-or-id>
   ```
2. The script outputs a clean Markdown file with a 2-column table (Japanese | Traditional Chinese) to `tsukuyomi-data/exports/`.

---

### Step 6: Updating Plot Memories
After translating key plot chapters:
1. Summarize significant plot developments, item acquisitions, or relationship changes.
2. Append to `novel.memories[]`:
   ```json
   {
     "id": "mem-<shortid>",
     "bookId": "<novel-id>",
     "content": "詳細情節記憶內容",
     "summary": "簡短摘要",
     "createdAt": Date.now(),
     "lastAccessedAt": Date.now()
   }
   ```
3. Save the JSON.

---

## References

- Data Schema details: `.opencode/skills/tsukuyomi-translator/references/JSON_SCHEMA.md`
- Prompt specifications: `.opencode/skills/tsukuyomi-translator/references/PROMPTS_GUIDE.md`
