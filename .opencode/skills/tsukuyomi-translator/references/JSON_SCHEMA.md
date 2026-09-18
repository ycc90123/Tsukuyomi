# Tsukuyomi Novel Data Schema Specification

Every novel managed by the `tsukuyomi-translator` skill is stored as an independent JSON file in `tsukuyomi-data/novels/<novel-id>.json`.

## File Naming Convention
`tsukuyomi-data/novels/<novel-id>.json` where `<novel-id>` is the unique ID (UUID or short ID) of the novel.

## Full JSON Schema & Data Structure

```json
{
  "id": "uuid-or-short-id",
  "title": "日文小說原名",
  "author": "作者名字",
  "description": "小說簡介/概要",
  "coverUrl": "封面圖 URL (可選)",
  "sourceUrl": "原始網址",
  "characterSettings": [
    {
      "id": "char-1",
      "name": "日文原名",
      "sex": "female",
      "description": "角色背景與個性說明",
      "speakingStyle": "說話口吻、句尾口癖",
      "translation": {
        "id": "t1",
        "translation": "繁體中文譯名",
        "aiModelId": "opencode-agent"
      },
      "aliases": [
        { "id": "a1", "name": "別名/愛稱" }
      ]
    }
  ],
  "terminologies": [
    {
      "id": "term-1",
      "name": "日文術語/技能名",
      "description": "專有名詞解釋",
      "translation": {
        "id": "t1",
        "translation": "繁體中文譯名",
        "aiModelId": "opencode-agent"
      }
    }
  ],
  "memories": [
    {
      "id": "mem-1",
      "bookId": "novel-id",
      "content": "記憶詳細內容 (例如：主角在第三章獲得了魔王之劍)",
      "summary": "簡短摘要",
      "createdAt": 1726600000000,
      "lastAccessedAt": 1726600000000
    }
  ],
  "volumes": [
    {
      "id": "vol-1",
      "title": "第一卷 原文標題",
      "chapters": [
        {
          "id": "chap-1",
          "title": {
            "original": "第一話 原文標題",
            "translation": {
              "id": "t1",
              "translation": "第一話 繁體中文譯名",
              "aiModelId": "opencode-agent"
            }
          },
          "webUrl": "https://ncode.syosetu.com/...",
          "contentLoaded": true,
          "content": [
            {
              "id": "p-1",
              "text": "日文原文段落內容...",
              "selectedTranslationId": "trans-1",
              "translations": [
                {
                  "id": "trans-1",
                  "translation": "繁體中文段落譯文...",
                  "aiModelId": "opencode-agent",
                  "referencedMemories": ["mem-1"]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

## Field Explanations for Agent Operation

1. **`selectedTranslationId`**: Points to the currently active `Translation.id` inside `translations[]`.
2. **`translations[]`**: Array allowing multiple versions (e.g. initial translation, polished version, proofread version).
3. **`characterSettings` & `terminologies`**: Extracted directly by the Agent or through initial analysis before translation. Must be referenced during translation for 100% term consistency.
4. **`memories`**: Story summary/events accumulated as chapters are translated to maintain long-context awareness.
