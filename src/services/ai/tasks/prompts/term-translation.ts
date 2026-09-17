/**
 * 術語翻譯服務提示詞
 */

export interface TermTranslationSystemPromptParams {
  bookContextSection?: string;
  chapterContextSection?: string;
  specialInstructionsSection?: string;
}

/**
 * 構建術語翻譯任務的系統提示詞（無書籍上下文時）
 */
export function buildTermTranslationSystemPromptBase(): string {
  return '你是專業的日輕小說翻譯助手，將日語術語翻譯爲自然流暢的繁體中文。\n\n';
}

/**
 * 構建術語翻譯任務的系統提示詞（有書籍上下文時）
 */
export function buildTermTranslationSystemPrompt(
  params: TermTranslationSystemPromptParams,
): string {
  const {
    bookContextSection = '',
    chapterContextSection = '',
    specialInstructionsSection = '',
  } = params;

  return `你是專業的日輕小說翻譯助手，將日語術語翻譯爲自然流暢的繁體中文。

${bookContextSection}${chapterContextSection}${specialInstructionsSection}

【核心規則】
1. **術語一致**: 使用術語表和角色表確保翻譯一致
2. **自然流暢**: 符合輕小說風格，保持術語的準確性
3. **上下文理解**: 根據當前書籍、章節的上下文來理解術語含義
4. **完整翻譯**: ⚠️ 必須翻譯所有單詞和短語，禁止在翻譯結果中保留未翻譯的日語原文（如日文假名、漢字等）

**輸出格式**：⚠️ **必須只返回 JSON 格式**（使用簡化鍵名 t=translation）
示例：{"t":"翻譯結果"}
只返回 JSON，不要包含任何其他內容、說明或代碼塊標記。

`;
}

export interface TermTranslationUserPromptParams {
  text: string;
  relatedContextInfo?: string | undefined;
  customPrompt?: string | undefined;
}

/**
 * 構建術語翻譯任務的用戶提示詞
 */
export function buildTermTranslationUserPrompt(params: TermTranslationUserPromptParams): string {
  const { text, relatedContextInfo = '', customPrompt } = params;

  if (customPrompt) {
    return customPrompt;
  }

  return `請將以下日文術語翻譯爲繁體中文，保持原文的格式和結構。⚠️ **必須只返回 JSON 格式**（使用簡化鍵名 t=translation）：
示例：{"t":"翻譯結果"}
只返回 JSON，不要包含任何其他內容、說明或代碼塊標記。

待翻譯術語：

${text}${relatedContextInfo}`;
}

/**
 * 構建 JSON 格式重試提示
 */
export function buildTermTranslationRetryPrompt(): string {
  return '響應格式錯誤：⚠️ **必須只返回 JSON 格式**：\n```json\n{\n  "t": "翻譯結果"\n}\n```\n只返回 JSON，不要包含任何其他內容、說明或代碼塊標記。';
}
