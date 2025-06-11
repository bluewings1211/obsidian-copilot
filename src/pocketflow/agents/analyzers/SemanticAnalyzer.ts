import { logInfo, logError } from "@/logger";

/**
 * 語義分析器
 *
 * 負責分析查詢與工具之間的語義相似度
 */
export class SemanticAnalyzer {
  private keywordMappings: Map<string, string[]>;
  private toolDescriptions: Map<string, string>;

  constructor() {
    this.initializeKeywordMappings();
    this.toolDescriptions = new Map();
  }

  /**
   * 初始化關鍵詞映射
   */
  private initializeKeywordMappings(): void {
    this.keywordMappings = new Map([
      // 搜索相關
      ["search", ["搜索", "搜尋", "尋找", "查找", "找", "find", "lookup", "search"]],
      ["local_search", ["本地", "筆記", "文檔", "檔案", "vault", "note", "document", "local"]],
      [
        "web_search",
        ["網路", "網上", "線上", "互聯網", "網頁", "web", "internet", "online", "google"],
      ],

      // 時間相關
      [
        "time",
        [
          "時間",
          "日期",
          "現在",
          "今天",
          "昨天",
          "明天",
          "time",
          "date",
          "today",
          "yesterday",
          "tomorrow",
        ],
      ],
      ["pomodoro", ["番茄", "計時", "專注", "工作", "pomodoro", "timer", "focus", "work"]],

      // 文件相關
      ["file", ["文件", "檔案", "文檔", "目錄", "樹狀", "file", "document", "tree", "directory"]],

      // MCP 工具
      ["brave_search", ["brave", "搜索引擎", "search engine"]],
      ["fetch", ["獲取", "抓取", "下載", "fetch", "download", "get"]],
      ["supabase", ["數據庫", "數據", "database", "data", "supabase"]],
      ["context7", ["文檔", "幫助", "documentation", "help", "context"]],
      ["sequential_thinking", ["思考", "推理", "分析", "think", "reasoning", "analysis"]],

      // 其他常見工具
      ["youtube", ["影片", "視頻", "音頻", "video", "audio", "youtube"]],
      ["obsidian", ["黑曜石", "筆記", "obsidian", "note"]],
    ]);
  }

  /**
   * 分析查詢與工具的語義匹配度
   */
  async analyzeQuery(query: string, tools: any[]): Promise<Record<string, number>> {
    const scores: Record<string, number> = {};

    try {
      const normalizedQuery = this.normalizeQuery(query);
      const queryTokens = this.tokenizeQuery(normalizedQuery);

      for (const tool of tools) {
        const toolName = this.getToolName(tool);
        const score = this.calculateSemanticScore(queryTokens, tool, normalizedQuery);
        scores[toolName] = score;
      }

      logInfo(`語義分析完成，分析了 ${tools.length} 個工具`);
      return scores;
    } catch (error) {
      logError("語義分析失敗:", error);
      return {};
    }
  }

  /**
   * 正規化查詢
   */
  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .replace(/[@#]/g, " ") // 移除特殊符號
      .replace(/\s+/g, " ") // 合併多個空格
      .trim();
  }

  /**
   * 分詞查詢
   */
  private tokenizeQuery(query: string): string[] {
    // 簡單的分詞邏輯，可以擴展使用更復雜的 NLP 庫
    return query.split(/\s+/).filter((token) => token.length > 1);
  }

  /**
   * 獲取工具名稱
   */
  private getToolName(tool: any): string {
    return tool.name || tool.function?.name || "unknown";
  }

  /**
   * 計算語義分數
   */
  private calculateSemanticScore(
    queryTokens: string[],
    tool: any,
    normalizedQuery: string
  ): number {
    const toolName = this.getToolName(tool);
    const toolDescription = this.getToolDescription(tool);

    let score = 0;
    let maxScore = 0;

    // 1. 直接名稱匹配
    const nameMatch = this.calculateNameMatch(queryTokens, toolName);
    score += nameMatch * 0.4;
    maxScore += 0.4;

    // 2. 關鍵詞映射匹配
    const keywordMatch = this.calculateKeywordMatch(queryTokens, toolName);
    score += keywordMatch * 0.3;
    maxScore += 0.3;

    // 3. 描述匹配
    const descriptionMatch = this.calculateDescriptionMatch(normalizedQuery, toolDescription);
    score += descriptionMatch * 0.2;
    maxScore += 0.2;

    // 4. 類別匹配
    const categoryMatch = this.calculateCategoryMatch(queryTokens, toolName);
    score += categoryMatch * 0.1;
    maxScore += 0.1;

    // 正規化分數到 0-1 範圍
    return maxScore > 0 ? Math.min(1, score / maxScore) : 0;
  }

  /**
   * 計算名稱匹配度
   */
  private calculateNameMatch(queryTokens: string[], toolName: string): number {
    const normalizedToolName = toolName.toLowerCase();
    let matches = 0;

    for (const token of queryTokens) {
      if (normalizedToolName.includes(token) || token.includes(normalizedToolName)) {
        matches++;
      }
    }

    return queryTokens.length > 0 ? matches / queryTokens.length : 0;
  }

  /**
   * 計算關鍵詞匹配度
   */
  private calculateKeywordMatch(queryTokens: string[], toolName: string): number {
    let bestMatch = 0;

    for (const [category, keywords] of this.keywordMappings) {
      if (toolName.toLowerCase().includes(category)) {
        let matches = 0;
        for (const token of queryTokens) {
          if (keywords.some((keyword) => keyword.includes(token) || token.includes(keyword))) {
            matches++;
          }
        }
        const matchRatio = queryTokens.length > 0 ? matches / queryTokens.length : 0;
        bestMatch = Math.max(bestMatch, matchRatio);
      }
    }

    return bestMatch;
  }

  /**
   * 計算描述匹配度
   */
  private calculateDescriptionMatch(query: string, description: string): number {
    if (!description) return 0;

    const normalizedDescription = description.toLowerCase();
    const queryWords = query.split(/\s+/);
    let matches = 0;

    for (const word of queryWords) {
      if (normalizedDescription.includes(word)) {
        matches++;
      }
    }

    return queryWords.length > 0 ? matches / queryWords.length : 0;
  }

  /**
   * 計算類別匹配度
   */
  private calculateCategoryMatch(queryTokens: string[], toolName: string): number {
    const categories = ["search", "web", "time", "file", "mcp"];
    let bestMatch = 0;

    for (const category of categories) {
      if (toolName.toLowerCase().includes(category)) {
        for (const token of queryTokens) {
          const keywords = this.keywordMappings.get(category) || [];
          if (keywords.some((keyword) => keyword.includes(token))) {
            bestMatch = Math.max(bestMatch, 0.5);
          }
        }
      }
    }

    return bestMatch;
  }

  /**
   * 獲取工具描述
   */
  private getToolDescription(tool: any): string {
    const toolName = this.getToolName(tool);

    // 檢查是否已緩存
    if (this.toolDescriptions.has(toolName)) {
      return this.toolDescriptions.get(toolName) || "";
    }

    let description = "";

    // 嘗試從多個來源獲取描述
    if (tool.description) {
      description = tool.description;
    } else if (tool.function?.description) {
      description = tool.function.description;
    } else if (tool.inputSchema?.description) {
      description = tool.inputSchema.description;
    } else {
      // 基於工具名稱生成基本描述
      description = this.generateBasicDescription(toolName);
    }

    // 緩存描述
    this.toolDescriptions.set(toolName, description);
    return description;
  }

  /**
   * 生成基本描述
   */
  private generateBasicDescription(toolName: string): string {
    const name = toolName.toLowerCase();

    if (name.includes("search")) {
      return "搜索和查找相關功能";
    }
    if (name.includes("web")) {
      return "網路搜索和網頁相關功能";
    }
    if (name.includes("time")) {
      return "時間和日期相關功能";
    }
    if (name.includes("file")) {
      return "文件和文檔相關功能";
    }
    if (name.includes("mcp_")) {
      return "MCP 外部工具功能";
    }

    return `${toolName} 工具功能`;
  }

  /**
   * 更新關鍵詞映射
   */
  updateKeywordMappings(category: string, keywords: string[]): void {
    this.keywordMappings.set(category, keywords);
  }

  /**
   * 添加工具描述
   */
  addToolDescription(toolName: string, description: string): void {
    this.toolDescriptions.set(toolName, description);
  }

  /**
   * 獲取分析統計
   */
  getAnalysisStatistics(): {
    mappingCount: number;
    descriptionCount: number;
    categories: string[];
  } {
    return {
      mappingCount: this.keywordMappings.size,
      descriptionCount: this.toolDescriptions.size,
      categories: Array.from(this.keywordMappings.keys()),
    };
  }

  /**
   * 重置分析器
   */
  reset(): void {
    this.toolDescriptions.clear();
    this.initializeKeywordMappings();
  }
}
