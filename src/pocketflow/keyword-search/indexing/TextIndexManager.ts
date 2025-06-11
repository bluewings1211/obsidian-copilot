/**
 * 文本索引管理器
 */

import {
  IndexingConfig,
  TextIndex,
  IndexedDocument,
  IndexedField,
  Token,
  IndexStatistics,
  IndexSettings,
  IndexStrategy,
  ParsedQuery,
  IndexError,
} from "../types";

export class TextIndexManager {
  private config: IndexingConfig;
  private indexes = new Map<string, TextIndex>();
  private isInitialized = false;
  private indexingTasks = new Map<string, Promise<void>>();

  constructor(config: IndexingConfig) {
    this.config = config;
  }

  /**
   * 初始化索引管理器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 創建默認索引
      await this.createDefaultIndexes();

      // 啟動後台優化任務
      this.startOptimizationScheduler();

      this.isInitialized = true;
    } catch (error) {
      throw new IndexError(
        "initialization",
        "initialize",
        `Failed to initialize index manager: ${error}`
      );
    }
  }

  /**
   * 創建默認索引
   */
  private async createDefaultIndexes(): Promise<void> {
    const defaultIndexes = [
      {
        name: "content_index",
        strategy: IndexStrategy.INVERTED_INDEX,
        fields: [
          { name: "content", type: "text" as const, searchable: true, stored: true, boost: 1.0 },
          { name: "title", type: "text" as const, searchable: true, stored: true, boost: 2.0 },
        ],
      },
      {
        name: "metadata_index",
        strategy: IndexStrategy.HASH_BASED,
        fields: [
          { name: "tags", type: "keyword" as const, searchable: true, stored: true },
          { name: "extension", type: "keyword" as const, searchable: true, stored: true },
          { name: "path", type: "keyword" as const, searchable: true, stored: true },
        ],
      },
    ];

    for (const indexDef of defaultIndexes) {
      await this.createIndex(indexDef.name, indexDef.strategy, indexDef.fields);
    }
  }

  /**
   * 創建索引
   */
  async createIndex(
    name: string,
    strategy: IndexStrategy,
    fields: Array<{
      name: string;
      type: "text" | "keyword" | "number" | "date" | "boolean";
      searchable: boolean;
      stored: boolean;
      boost?: number;
    }>
  ): Promise<void> {
    if (this.indexes.has(name)) {
      throw new IndexError(name, "create", "Index already exists");
    }

    try {
      const indexFields = fields.map((field) => ({
        ...field,
        analyzer: field.type === "text" ? "standard" : undefined,
      }));

      const index: TextIndex = {
        id: `idx_${name}_${Date.now()}`,
        name,
        type: strategy,
        fields: indexFields,
        documents: new Map(),
        statistics: this.createEmptyStatistics(),
        settings: this.createDefaultSettings(),
      };

      this.indexes.set(name, index);
    } catch (error) {
      throw new IndexError(name, "create", `Failed to create index: ${error}`);
    }
  }

  /**
   * 添加文檔到索引
   */
  async addDocument(indexName: string, document: any): Promise<void> {
    const index = this.indexes.get(indexName);
    if (!index) {
      throw new IndexError(indexName, "addDocument", "Index not found");
    }

    try {
      const indexedDoc = await this.processDocumentForIndexing(document, index);
      index.documents.set(document.id, indexedDoc);

      // 更新統計信息
      this.updateIndexStatistics(index, indexedDoc);
    } catch (error) {
      throw new IndexError(indexName, "addDocument", `Failed to add document: ${error}`);
    }
  }

  /**
   * 處理文檔以進行索引
   */
  private async processDocumentForIndexing(
    document: any,
    index: TextIndex
  ): Promise<IndexedDocument> {
    const indexedFields = new Map<string, IndexedField>();

    for (const field of index.fields) {
      const fieldValue = document[field.name];
      if (fieldValue !== undefined && fieldValue !== null) {
        const indexedField = await this.processField(fieldValue, field, index.settings);
        indexedFields.set(field.name, indexedField);
      }
    }

    return {
      id: document.id,
      fields: indexedFields,
      metadata: document.metadata || {},
      lastModified: Date.now(),
    };
  }

  /**
   * 處理字段
   */
  private async processField(
    value: any,
    fieldDef: any,
    settings: IndexSettings
  ): Promise<IndexedField> {
    const field: IndexedField = {
      name: fieldDef.name,
      value,
      boost: fieldDef.boost,
    };

    if (fieldDef.type === "text" && fieldDef.searchable) {
      // 分詞處理
      const tokens = await this.tokenizeText(String(value), settings);
      field.tokens = tokens;
      field.positions = tokens.map((_, index) => index);
    }

    return field;
  }

  /**
   * 文本分詞
   */
  private async tokenizeText(text: string, settings: IndexSettings): Promise<Token[]> {
    const tokens: Token[] = [];

    // 基礎分詞邏輯
    let cleanText = text.toLowerCase();

    // 移除標點符號但保留有意義的字符
    cleanText = cleanText.replace(/[^\w\s-]/g, " ");

    // 分割成詞
    const words = cleanText.split(/\s+/).filter((word) => word.length > 0);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      // 長度過濾
      if (word.length < settings.minTermLength || word.length > settings.maxTermLength) {
        continue;
      }

      // 停用詞過濾
      if (settings.stopWords.includes(word)) {
        continue;
      }

      // 詞幹提取
      const stemmedWord = settings.stemming ? this.stemWord(word) : word;

      tokens.push({
        text: settings.caseSensitive ? stemmedWord : stemmedWord.toLowerCase(),
        position: i,
        offset: { start: 0, end: word.length }, // 簡化處理
        boost: 1.0,
      });
    }

    return tokens;
  }

  /**
   * 簡單詞幹提取
   */
  private stemWord(word: string): string {
    // 簡化的英文詞幹提取
    const suffixes = ["ing", "ed", "er", "est", "ly", "s"];

    for (const suffix of suffixes) {
      if (word.endsWith(suffix) && word.length > suffix.length + 2) {
        return word.slice(0, -suffix.length);
      }
    }

    return word;
  }

  /**
   * 搜索索引
   */
  async searchIndex(
    indexName: string,
    query: ParsedQuery
  ): Promise<{
    documents: any[];
    totalFound: number;
  }> {
    const index = this.indexes.get(indexName);
    if (!index) {
      throw new IndexError(indexName, "search", "Index not found");
    }

    try {
      const searchResults = await this.executeSearch(index, query);
      return searchResults;
    } catch (error) {
      throw new IndexError(indexName, "search", `Search failed: ${error}`);
    }
  }

  /**
   * 執行搜索
   */
  private async executeSearch(
    index: TextIndex,
    query: ParsedQuery
  ): Promise<{
    documents: any[];
    totalFound: number;
  }> {
    const candidateDocuments = new Map<string, { doc: IndexedDocument; score: number }>();

    // 基於查詢詞搜索
    for (const term of query.terms) {
      const matchingDocs = this.searchTerm(index, term);

      matchingDocs.forEach((score, docId) => {
        const existing = candidateDocuments.get(docId);
        if (existing) {
          existing.score += score;
        } else {
          const doc = index.documents.get(docId);
          if (doc) {
            candidateDocuments.set(docId, { doc, score });
          }
        }
      });
    }

    // 基於短語搜索
    for (const phrase of query.phrases) {
      const matchingDocs = this.searchPhrase(index, phrase);

      matchingDocs.forEach((score, docId) => {
        const existing = candidateDocuments.get(docId);
        if (existing) {
          existing.score += score * 1.5; // 短語匹配權重更高
        } else {
          const doc = index.documents.get(docId);
          if (doc) {
            candidateDocuments.set(docId, { doc, score: score * 1.5 });
          }
        }
      });
    }

    // 排序結果
    const sortedResults = Array.from(candidateDocuments.values()).sort((a, b) => b.score - a.score);

    // 轉換為輸出格式
    const documents = sortedResults.map((result) =>
      this.convertToOutputDocument(result.doc, result.score)
    );

    return {
      documents,
      totalFound: documents.length,
    };
  }

  /**
   * 搜索詞項
   */
  private searchTerm(index: TextIndex, term: any): Map<string, number> {
    const results = new Map<string, number>();
    const searchText = term.text.toLowerCase();

    index.documents.forEach((doc, docId) => {
      let documentScore = 0;

      doc.fields.forEach((field, fieldName) => {
        if (!field.tokens) return;

        let fieldScore = 0;
        const fieldDef = index.fields.find((f) => f.name === fieldName);
        const fieldBoost = fieldDef?.boost || 1.0;

        // 精確匹配
        const exactMatches = field.tokens.filter((token) => token.text === searchText).length;
        fieldScore += exactMatches * 2.0;

        // 部分匹配
        if (term.fuzzy) {
          const fuzzyMatches = field.tokens.filter(
            (token) => this.calculateSimilarity(token.text, searchText) > 0.7
          ).length;
          fieldScore += fuzzyMatches * 1.0;
        }

        // 通配符匹配
        if (searchText.includes("*") || searchText.includes("?")) {
          const wildcardMatches = field.tokens.filter((token) =>
            this.matchWildcard(token.text, searchText)
          ).length;
          fieldScore += wildcardMatches * 1.5;
        }

        documentScore += fieldScore * fieldBoost;
      });

      if (documentScore > 0) {
        results.set(docId, documentScore);
      }
    });

    return results;
  }

  /**
   * 搜索短語
   */
  private searchPhrase(index: TextIndex, phrase: any): Map<string, number> {
    const results = new Map<string, number>();
    const phraseTokens = phrase.text.toLowerCase().split(/\s+/);

    index.documents.forEach((doc, docId) => {
      let documentScore = 0;

      doc.fields.forEach((field, fieldName) => {
        if (!field.tokens) return;

        const fieldDef = index.fields.find((f) => f.name === fieldName);
        const fieldBoost = fieldDef?.boost || 1.0;

        // 查找短語匹配
        const phraseMatches = this.findPhraseMatches(field.tokens, phraseTokens, phrase.slop || 0);
        documentScore += phraseMatches * 3.0 * fieldBoost; // 短語匹配分數更高
      });

      if (documentScore > 0) {
        results.set(docId, documentScore);
      }
    });

    return results;
  }

  /**
   * 查找短語匹配
   */
  private findPhraseMatches(tokens: Token[], phraseTokens: string[], slop: number): number {
    let matches = 0;

    for (let i = 0; i <= tokens.length - phraseTokens.length; i++) {
      let matchedTokens = 0;
      let lastMatchPosition = i - 1;

      for (const phraseToken of phraseTokens) {
        let found = false;

        // 在允許的距離內查找下一個詞
        const searchEnd = Math.min(tokens.length, lastMatchPosition + slop + 2);

        for (let j = lastMatchPosition + 1; j < searchEnd; j++) {
          if (tokens[j].text === phraseToken) {
            matchedTokens++;
            lastMatchPosition = j;
            found = true;
            break;
          }
        }

        if (!found) break;
      }

      if (matchedTokens === phraseTokens.length) {
        matches++;
      }
    }

    return matches;
  }

  /**
   * 計算字符串相似度
   */
  private calculateSimilarity(str1: string, str2: string): number {
    // 簡化的編輯距離計算
    const len1 = str1.length;
    const len2 = str2.length;

    if (len1 === 0) return len2 === 0 ? 1 : 0;
    if (len2 === 0) return 0;

    const matrix = Array(len1 + 1)
      .fill(null)
      .map(() => Array(len2 + 1).fill(0));

    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const distance = matrix[len1][len2];
    return 1 - distance / Math.max(len1, len2);
  }

  /**
   * 通配符匹配
   */
  private matchWildcard(text: string, pattern: string): boolean {
    // 簡化的通配符匹配
    const regexPattern = pattern.replace(/\*/g, ".*").replace(/\?/g, ".");

    try {
      const regex = new RegExp(`^${regexPattern}$`, "i");
      return regex.test(text);
    } catch {
      return false;
    }
  }

  /**
   * 轉換為輸出文檔格式
   */
  private convertToOutputDocument(doc: IndexedDocument, score: number): any {
    const outputDoc: any = {
      id: doc.id,
      score,
      metadata: doc.metadata,
    };

    // 添加存儲的字段值
    doc.fields.forEach((field, fieldName) => {
      const fieldDef = this.findFieldDefinition(fieldName);
      if (fieldDef?.stored) {
        outputDoc[fieldName] = field.value;
      }
    });

    return outputDoc;
  }

  /**
   * 查找字段定義
   */
  private findFieldDefinition(fieldName: string): any {
    for (const index of this.indexes.values()) {
      const fieldDef = index.fields.find((f) => f.name === fieldName);
      if (fieldDef) return fieldDef;
    }
    return null;
  }

  /**
   * 更新索引統計
   */
  private updateIndexStatistics(index: TextIndex, doc: IndexedDocument): void {
    index.statistics.documentCount++;

    doc.fields.forEach((field, fieldName) => {
      if (!index.statistics.fieldStatistics.has(fieldName)) {
        index.statistics.fieldStatistics.set(fieldName, {
          documentCount: 0,
          termCount: 0,
          averageLength: 0,
          maxLength: 0,
          minLength: Number.MAX_SAFE_INTEGER,
          commonTerms: [],
        });
      }

      const fieldStats = index.statistics.fieldStatistics.get(fieldName)!;
      fieldStats.documentCount++;

      if (field.tokens) {
        fieldStats.termCount += field.tokens.length;
        const fieldLength = field.tokens.length;
        fieldStats.maxLength = Math.max(fieldStats.maxLength, fieldLength);
        fieldStats.minLength = Math.min(fieldStats.minLength, fieldLength);
        fieldStats.averageLength = fieldStats.termCount / fieldStats.documentCount;
      }
    });

    index.statistics.lastUpdated = Date.now();
  }

  /**
   * 創建空的統計信息
   */
  private createEmptyStatistics(): IndexStatistics {
    return {
      documentCount: 0,
      termCount: 0,
      averageDocumentLength: 0,
      fieldStatistics: new Map(),
      lastUpdated: Date.now(),
      buildTime: 0,
      memoryUsage: 0,
    };
  }

  /**
   * 創建默認設置
   */
  private createDefaultSettings(): IndexSettings {
    return {
      analyzer: "standard",
      tokenizer: "standard",
      filters: ["lowercase", "stop"],
      maxTermLength: 50,
      minTermLength: 2,
      stopWords: ["the", "is", "at", "which", "on", "and", "or", "but", "in", "with", "a", "an"],
      stemming: true,
      caseSensitive: false,
      compressTerms: false,
      cacheSize: 1000,
    };
  }

  /**
   * 啟動優化調度器
   */
  private startOptimizationScheduler(): void {
    if (this.config.optimizeSchedule) {
      // 簡化實現：定期優化
      setInterval(() => {
        this.optimizeAllIndexes().catch((error) => {
          console.error("Index optimization failed:", error);
        });
      }, 3600000); // 每小時優化一次
    }
  }

  /**
   * 獲取可用索引
   */
  async getAvailableIndexes(): Promise<string[]> {
    return Array.from(this.indexes.keys());
  }

  /**
   * 獲取文檔數量
   */
  async getDocumentCount(): Promise<number> {
    let totalCount = 0;
    for (const index of this.indexes.values()) {
      totalCount += index.statistics.documentCount;
    }
    return totalCount;
  }

  /**
   * 獲取索引統計
   */
  getIndexStatistics(indexName: string): IndexStatistics | null {
    const index = this.indexes.get(indexName);
    return index ? index.statistics : null;
  }

  /**
   * 獲取所有索引統計
   */
  async getAllIndexStatistics(): Promise<Record<string, IndexStatistics>> {
    const stats: Record<string, IndexStatistics> = {};

    this.indexes.forEach((index, name) => {
      stats[name] = index.statistics;
    });

    return stats;
  }

  /**
   * 重建所有索引
   */
  async rebuildAllIndexes(): Promise<void> {
    const rebuildPromises = Array.from(this.indexes.keys()).map((indexName) =>
      this.rebuildIndex(indexName)
    );

    await Promise.all(rebuildPromises);
  }

  /**
   * 重建索引
   */
  async rebuildIndex(indexName: string): Promise<void> {
    const index = this.indexes.get(indexName);
    if (!index) {
      throw new IndexError(indexName, "rebuild", "Index not found");
    }

    // 清空現有數據
    index.documents.clear();
    index.statistics = this.createEmptyStatistics();

    // 重新索引（實際實現中需要從數據源重新加載文檔）
    console.log(`Index ${indexName} has been rebuilt`);
  }

  /**
   * 優化所有索引
   */
  async optimizeAllIndexes(): Promise<void> {
    const optimizePromises = Array.from(this.indexes.keys()).map((indexName) =>
      this.optimizeIndex(indexName)
    );

    await Promise.all(optimizePromises);
  }

  /**
   * 優化索引
   */
  async optimizeIndex(indexName: string): Promise<void> {
    const index = this.indexes.get(indexName);
    if (!index) {
      throw new IndexError(indexName, "optimize", "Index not found");
    }

    // 簡化的優化邏輯
    // 實際實現中可以包括：
    // - 壓縮索引
    // - 合併分段
    // - 清理無效數據
    // - 重新組織數據結構

    console.log(`Index ${indexName} has been optimized`);
  }

  /**
   * 關閉索引管理器
   */
  async shutdown(): Promise<void> {
    // 等待所有正在進行的索引任務完成
    if (this.indexingTasks.size > 0) {
      await Promise.all(this.indexingTasks.values());
    }

    // 清理資源
    this.indexes.clear();
    this.indexingTasks.clear();

    this.isInitialized = false;
  }
}
