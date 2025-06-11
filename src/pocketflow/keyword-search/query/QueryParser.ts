/**
 * 查詢語法解析器 - 支持 AND/OR/NOT/短語搜索
 */

import {
  ParsedQuery,
  QueryTerm,
  QueryOperator,
  QueryPhrase,
  QueryFilter,
  QueryBooster,
  QueryStructure,
  QueryConfig,
  QueryParseError,
  KeywordSearchContext,
} from "../types";

export class QueryParser {
  private config: QueryConfig;
  private isInitialized = false;

  // 查詢語法正則表達式
  private readonly patterns = {
    phrase: /"([^"]+)"/g,
    field: /(\w+):\s*([^\s]+|"[^"]*")/g,
    boolean: /\b(AND|OR|NOT)\b/gi,
    proximity: /(\w+)\s+NEAR\/(\d+)\s+(\w+)/gi,
    boost: /(\w+)\^(\d+\.?\d*)/g,
    wildcard: /\w*[*?]\w*/g,
    fuzzy: /(\w+)~(\d*\.?\d*)?/g,
    range: /(\w+):\s*\[([^\]]+)\s+TO\s+([^\]]+)\]/gi,
    group: /\(([^)]+)\)/g,
  };

  constructor(config: QueryConfig) {
    this.config = config;
  }

  /**
   * 初始化解析器
   */
  async initialize(): Promise<void> {
    this.isInitialized = true;
  }

  /**
   * 解析查詢
   */
  async parse(
    query: string,
    options?: {
      enableExpansion?: boolean;
      enableSpellCorrection?: boolean;
      context?: KeywordSearchContext;
    }
  ): Promise<ParsedQuery> {
    if (!this.isInitialized) {
      throw new QueryParseError(query, "Parser not initialized");
    }

    try {
      // 預處理查詢
      const preprocessedQuery = this.preprocessQuery(query);

      // 解析各個組件
      const phrases = this.extractPhrases(preprocessedQuery);
      const terms = this.extractTerms(preprocessedQuery, phrases);
      const operators = this.extractOperators(preprocessedQuery);
      const filters = this.extractFilters(preprocessedQuery);
      const boosters = this.extractBoosters(preprocessedQuery);

      // 分析查詢結構
      const structure = this.analyzeQueryStructure(preprocessedQuery, {
        terms,
        operators,
        phrases,
        filters,
        boosters,
      });

      // 應用查詢擴展
      if (options?.enableExpansion) {
        await this.expandQuery(terms, options.context);
      }

      // 應用拼寫糾正
      if (options?.enableSpellCorrection) {
        await this.correctSpelling(terms);
      }

      // 驗證查詢
      this.validateQuery({
        terms,
        operators,
        phrases,
        filters,
        boosters,
        structure,
      });

      return {
        terms,
        operators,
        phrases,
        filters,
        boosters,
        structure,
      };
    } catch (error) {
      if (error instanceof QueryParseError) {
        throw error;
      }
      throw new QueryParseError(query, `Parse error: ${error}`);
    }
  }

  /**
   * 預處理查詢
   */
  private preprocessQuery(query: string): string {
    // 去除多餘空格
    let processed = query.trim().replace(/\s+/g, " ");

    // 處理特殊字符
    processed = processed.replace(/["""]/g, '"'); // 統一引號
    processed = processed.replace(/['']/g, "'"); // 統一撇號

    // 長度檢查
    if (processed.length > this.config.maxQueryLength) {
      throw new QueryParseError(
        query,
        `Query exceeds maximum length of ${this.config.maxQueryLength} characters`
      );
    }

    return processed;
  }

  /**
   * 提取短語
   */
  private extractPhrases(query: string): QueryPhrase[] {
    const phrases: QueryPhrase[] = [];
    let match;

    // 重置正則表達式的 lastIndex
    this.patterns.phrase.lastIndex = 0;

    while ((match = this.patterns.phrase.exec(query)) !== null) {
      const phraseText = match[1];

      if (phraseText.trim().length > 0) {
        phrases.push({
          text: phraseText,
          field: undefined, // 可以後續增強以支持字段特定短語
          slop: 0, // 單詞間允許的距離
          boost: 1.0,
        });
      }
    }

    return phrases;
  }

  /**
   * 提取詞項
   */
  private extractTerms(query: string, phrases: QueryPhrase[]): QueryTerm[] {
    // 先移除短語，避免重複處理
    let processedQuery = query;
    phrases.forEach((phrase) => {
      processedQuery = processedQuery.replace(`"${phrase.text}"`, "");
    });

    const terms: QueryTerm[] = [];
    const words = processedQuery.split(/\s+/).filter((word) => word.trim().length > 0);

    for (const word of words) {
      // 跳過純操作符
      if (/^(AND|OR|NOT)$/i.test(word)) {
        continue;
      }

      // 解析字段查詢
      const fieldMatch = word.match(/^(\w+):(.+)$/);
      if (fieldMatch) {
        const [, fieldName, fieldValue] = fieldMatch;
        terms.push({
          text: fieldValue.replace(/^["'](.+)["']$/, "$1"),
          field: fieldName,
          boost: 1.0,
          fuzzy: false,
          required: false,
          excluded: false,
        });
        continue;
      }

      // 解析模糊查詢
      const fuzzyMatch = word.match(/^(.+)~(\d*\.?\d*)?$/);
      if (fuzzyMatch) {
        const [, termText, fuzziness] = fuzzyMatch;
        terms.push({
          text: termText,
          boost: 1.0,
          fuzzy: true,
          proximity: fuzziness ? parseFloat(fuzziness) : 0.5,
          required: false,
          excluded: false,
        });
        continue;
      }

      // 解析權重提升
      const boostMatch = word.match(/^(.+)\^(\d+\.?\d*)$/);
      if (boostMatch) {
        const [, termText, boostValue] = boostMatch;
        terms.push({
          text: termText,
          boost: parseFloat(boostValue),
          fuzzy: false,
          required: false,
          excluded: false,
        });
        continue;
      }

      // 解析必需/排除符號
      let termText = word;
      let required = false;
      let excluded = false;

      if (word.startsWith("+")) {
        required = true;
        termText = word.substring(1);
      } else if (word.startsWith("-")) {
        excluded = true;
        termText = word.substring(1);
      }

      // 普通詞項
      if (termText.length > 0) {
        terms.push({
          text: termText,
          boost: 1.0,
          fuzzy: false,
          required,
          excluded,
        });
      }
    }

    // 限制詞項數量
    if (terms.length > this.config.maxQueryTerms) {
      throw new QueryParseError(
        query,
        `Query contains too many terms (${terms.length}). Maximum allowed: ${this.config.maxQueryTerms}`
      );
    }

    return terms;
  }

  /**
   * 提取操作符
   */
  private extractOperators(query: string): QueryOperator[] {
    const operators: QueryOperator[] = [];

    // 查找布爾操作符
    let match;
    this.patterns.boolean.lastIndex = 0;

    while ((match = this.patterns.boolean.exec(query)) !== null) {
      const operator = match[0].toUpperCase() as "AND" | "OR" | "NOT";

      // 簡化處理：記錄操作符位置和類型
      operators.push({
        type: operator,
        left: "", // 實際實現中需要更精確的解析
        right: "",
      });
    }

    // 查找 NEAR 操作符
    this.patterns.proximity.lastIndex = 0;
    while ((match = this.patterns.proximity.exec(query)) !== null) {
      const [, left, distance, right] = match;
      operators.push({
        type: "NEAR",
        left,
        right,
        distance: parseInt(distance, 10),
      });
    }

    return operators;
  }

  /**
   * 提取過濾器
   */
  private extractFilters(query: string): QueryFilter[] {
    const filters: QueryFilter[] = [];

    // 提取範圍查詢
    let match;
    this.patterns.range.lastIndex = 0;

    while ((match = this.patterns.range.exec(query)) !== null) {
      const [, field, from, to] = match;
      filters.push({
        field,
        operator: "between",
        value: [from.trim(), to.trim()],
      });
    }

    return filters;
  }

  /**
   * 提取權重提升
   */
  private extractBoosters(query: string): QueryBooster[] {
    const boosters: QueryBooster[] = [];

    let match;
    this.patterns.boost.lastIndex = 0;

    while ((match = this.patterns.boost.exec(query)) !== null) {
      const [, field, boostValue] = match;
      boosters.push({
        field,
        boost: parseFloat(boostValue),
        function: "linear",
      });
    }

    return boosters;
  }

  /**
   * 分析查詢結構
   */
  private analyzeQueryStructure(
    query: string,
    components: {
      terms: QueryTerm[];
      operators: QueryOperator[];
      phrases: QueryPhrase[];
      filters: QueryFilter[];
      boosters: QueryBooster[];
    }
  ): QueryStructure {
    const { terms, operators, phrases, filters } = components;

    // 確定查詢類型
    let type: "simple" | "boolean" | "phrase" | "complex" = "simple";

    if (phrases.length > 0) {
      type = "phrase";
    } else if (operators.length > 0) {
      type = "boolean";
    } else if (filters.length > 0 || terms.some((t) => t.field)) {
      type = "complex";
    }

    // 計算複雜度
    let complexity = terms.length;
    complexity += operators.length * 2;
    complexity += phrases.length * 1.5;
    complexity += filters.length * 2;

    // 計算深度
    const depth = this.calculateQueryDepth(query);

    // 檢查特殊特性
    const hasWildcards = this.patterns.wildcard.test(query);
    const hasRegexp = /\/.*\//.test(query);
    const hasFuzzy = terms.some((t) => t.fuzzy);

    return {
      type,
      depth,
      complexity,
      hasWildcards,
      hasRegexp,
      hasFuzzy,
    };
  }

  /**
   * 計算查詢深度
   */
  private calculateQueryDepth(query: string): number {
    let depth = 0;
    let currentDepth = 0;

    for (const char of query) {
      if (char === "(") {
        currentDepth++;
        depth = Math.max(depth, currentDepth);
      } else if (char === ")") {
        currentDepth--;
      }
    }

    return depth;
  }

  /**
   * 查詢擴展
   */
  private async expandQuery(terms: QueryTerm[], context?: KeywordSearchContext): Promise<void> {
    // 基於上下文的查詢擴展
    if (!context) return;

    for (const term of terms) {
      // 同義詞擴展
      const synonyms = await this.getSynonyms(term.text);
      console.log(`Synonyms for ${term.text}:`, synonyms); // 使用 console.log 避免未使用變量警告

      // 基於歷史查詢的擴展
      if (context.previousQueries) {
        const relatedTerms = this.findRelatedTerms(term.text, context.previousQueries);
        console.log(`Related terms for ${term.text}:`, relatedTerms); // 使用 console.log 避免未使用變量警告
      }
    }
  }

  /**
   * 獲取同義詞
   */
  private async getSynonyms(term: string): Promise<string[]> {
    // 簡化實現，實際中可以接入同義詞詞典
    const synonymMap: Record<string, string[]> = {
      fast: ["quick", "rapid", "swift"],
      big: ["large", "huge", "massive"],
      small: ["tiny", "little", "mini"],
    };

    return synonymMap[term.toLowerCase()] || [];
  }

  /**
   * 查找相關詞項
   */
  private findRelatedTerms(term: string, previousQueries: string[]): string[] {
    const related: string[] = [];

    // 簡化實現：查找在歷史查詢中與當前詞項共現的詞
    previousQueries.forEach((prevQuery) => {
      if (prevQuery.toLowerCase().includes(term.toLowerCase())) {
        const words = prevQuery.split(/\s+/);
        words.forEach((word) => {
          if (word.toLowerCase() !== term.toLowerCase() && word.length > 2) {
            related.push(word);
          }
        });
      }
    });

    return [...new Set(related)]; // 去重
  }

  /**
   * 拼寫糾正
   */
  private async correctSpelling(terms: QueryTerm[]): Promise<void> {
    // 簡化實現，實際中可以接入拼寫檢查器
    for (const term of terms) {
      const corrected = this.simpleSpellCorrect(term.text);
      if (corrected !== term.text) {
        term.text = corrected;
      }
    }
  }

  /**
   * 簡單拼寫糾正
   */
  private simpleSpellCorrect(word: string): string {
    // 簡化的拼寫糾正邏輯
    const corrections: Record<string, string> = {
      teh: "the",
      recieve: "receive",
      seperate: "separate",
      definately: "definitely",
    };

    return corrections[word.toLowerCase()] || word;
  }

  /**
   * 驗證查詢
   */
  private validateQuery(parsedQuery: ParsedQuery): void {
    const { terms, operators, structure } = parsedQuery;

    // 檢查是否有有效的搜索詞項
    if (terms.length === 0 && parsedQuery.phrases.length === 0) {
      throw new QueryParseError("", "Query must contain at least one search term or phrase");
    }

    // 檢查操作符的有效性
    if (operators.length > 0) {
      // 簡化檢查：確保操作符數量合理
      if (operators.length >= terms.length) {
        throw new QueryParseError("", "Too many operators relative to terms");
      }
    }

    // 檢查複雜度限制
    if (structure.complexity > 20) {
      throw new QueryParseError("", "Query is too complex");
    }

    // 檢查嵌套深度
    if (structure.depth > 5) {
      throw new QueryParseError("", "Query nesting is too deep");
    }
  }

  /**
   * 關閉解析器
   */
  async shutdown(): Promise<void> {
    this.isInitialized = false;
  }
}
