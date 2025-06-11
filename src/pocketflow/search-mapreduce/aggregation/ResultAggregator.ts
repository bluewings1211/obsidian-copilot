/**
 * 結果聚合器 - 最終處理和優化搜索結果
 */

import { Document } from "@langchain/core/documents";
import { AggregationConfig, SearchContext, SearchResult } from "../types";
import { ScoreNormalizer } from "./ScoreNormalizer";
import { ResultDeduplicator } from "./ResultDeduplicator";
import { RelevanceRanker } from "./RelevanceRanker";

export class ResultAggregator {
  private scoreNormalizer: ScoreNormalizer;
  private deduplicator: ResultDeduplicator;
  private ranker: RelevanceRanker;

  constructor(private config: AggregationConfig) {
    this.scoreNormalizer = new ScoreNormalizer(config);
    this.deduplicator = new ResultDeduplicator(config);
    this.ranker = new RelevanceRanker(config);
  }

  /**
   * 處理搜索結果
   */
  async processResults(
    results: SearchResult[],
    context: SearchContext
  ): Promise<{
    documents: Document[];
    totalResults: number;
    normalizedScores: boolean;
    deduplicated: boolean;
    reranked: boolean;
  }> {
    if (results.length === 0) {
      return {
        documents: [],
        totalResults: 0,
        normalizedScores: false,
        deduplicated: false,
        reranked: false,
      };
    }

    let processedResults = [...results];
    let normalizedScores = false;
    let deduplicated = false;
    let reranked = false;

    try {
      // 1. 分數標準化
      if (this.config.normalizeScores) {
        const normalizationResult = await this.scoreNormalizer.normalizeScores(processedResults);
        processedResults = normalizationResult.normalizedResults;
        normalizedScores = true;
      }

      // 2. 去重處理
      const deduplicationResult = await this.deduplicator.deduplicateResults(processedResults);
      processedResults = deduplicationResult.uniqueResults.map((doc: SearchResult) =>
        this.convertDocumentToSearchResult(doc.document, processedResults)
      );
      deduplicated = deduplicationResult.duplicatesRemoved > 0;

      // 3. 相關性重排序
      if (this.config.enableReranking) {
        const shouldRerank = this.shouldEnableReranking(processedResults, context);

        if (shouldRerank) {
          processedResults = await this.ranker.rerankResults(processedResults, context);
          reranked = true;
        }
      }

      // 4. 最終過濾和排序
      processedResults = this.finalizeResults(processedResults, context);

      // 5. 提取文檔
      const documents = processedResults.map((result) => result.document);

      return {
        documents,
        totalResults: documents.length,
        normalizedScores,
        deduplicated,
        reranked,
      };
    } catch (error) {
      console.error("Error processing search results:", error);

      // 出錯時返回原始結果
      return {
        documents: results.map((result) => result.document),
        totalResults: results.length,
        normalizedScores: false,
        deduplicated: false,
        reranked: false,
      };
    }
  }

  /**
   * 判斷是否需要重排序
   */
  private shouldEnableReranking(results: SearchResult[], context: SearchContext): boolean {
    // 檢查重排序閾值
    if (this.config.rerankingThreshold !== undefined) {
      const maxScore = Math.max(...results.map((r) => r.score));
      if (maxScore >= this.config.rerankingThreshold) {
        return false; // 分數已經足夠高，不需要重排序
      }
    }

    // 檢查結果數量（太少的結果不需要重排序）
    if (results.length < 3) {
      return false;
    }

    // 檢查分數分佈（如果分數差異很大，可能不需要重排序）
    const scores = results.map((r) => r.score).sort((a, b) => b - a);
    const scoreRange = scores[0] - scores[scores.length - 1];
    if (scoreRange > 0.8) {
      return false; // 分數差異很大，原排序可能已經很好
    }

    // 檢查查詢複雜度（復雜查詢更需要重排序）
    if (context.query.length > 50) {
      return true;
    }

    // 檢查是否有多種策略結果（混合結果更需要重排序）
    const uniqueStrategies = new Set(results.map((r) => r.strategy));
    if (uniqueStrategies.size > 1) {
      return true;
    }

    return false;
  }

  /**
   * 最終結果處理
   */
  private finalizeResults(results: SearchResult[], context: SearchContext): SearchResult[] {
    // 按分數排序
    results.sort((a, b) => {
      // 優先按主分數排序
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      // 分數相同時按相關性分數排序
      if (b.relevanceScore !== undefined && a.relevanceScore !== undefined) {
        return b.relevanceScore - a.relevanceScore;
      }

      // 最後按策略優先級排序
      const strategyPriority = this.getStrategyPriority(a.strategy, b.strategy);
      if (strategyPriority !== 0) {
        return strategyPriority;
      }

      return 0;
    });

    // 應用質量過濾
    const qualityFiltered = this.applyQualityFilters(results, context);

    // 限制結果數量
    const maxResults = Math.min(
      this.config.maxResults,
      context.filters?.maxResults || this.config.maxResults
    );

    return qualityFiltered.slice(0, maxResults);
  }

  /**
   * 應用質量過濾
   */
  private applyQualityFilters(results: SearchResult[], context: SearchContext): SearchResult[] {
    return results.filter((result) => {
      // 分數過濾
      if (result.score < 0.01) {
        return false;
      }

      // 內容長度過濾
      const content = result.document.pageContent;
      if (content.length < 10) {
        return false; // 內容太短
      }

      // 內容質量過濾
      if (this.isLowQualityContent(content)) {
        return false;
      }

      // 重複內容過濾（簡單檢查）
      const duplicateRatio = this.calculateContentDuplicateRatio(content);
      if (duplicateRatio > 0.9) {
        return false;
      }

      return true;
    });
  }

  /**
   * 檢查低質量內容
   */
  private isLowQualityContent(content: string): boolean {
    // 檢查是否主要包含特殊字符
    const specialCharRatio = (content.match(/[^\w\s]/g) || []).length / content.length;
    if (specialCharRatio > 0.5) {
      return true;
    }

    // 檢查是否主要包含數字
    const numberRatio = (content.match(/\d/g) || []).length / content.length;
    if (numberRatio > 0.7) {
      return true;
    }

    // 檢查重複單詞
    const words = content.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);
    const uniqueRatio = uniqueWords.size / words.length;
    if (uniqueRatio < 0.3 && words.length > 20) {
      return true; // 重複詞太多
    }

    return false;
  }

  /**
   * 計算內容重複比例
   */
  private calculateContentDuplicateRatio(content: string): number {
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 10);
    if (sentences.length < 2) {
      return 0;
    }

    const uniqueSentences = new Set(sentences.map((s) => s.trim().toLowerCase()));
    return 1 - uniqueSentences.size / sentences.length;
  }

  /**
   * 獲取策略優先級
   */
  private getStrategyPriority(strategyA: string, strategyB: string): number {
    const priorityOrder = ["hybrid", "vector", "keyword", "rerank"];
    const aIndex = priorityOrder.indexOf(strategyA);
    const bIndex = priorityOrder.indexOf(strategyB);

    if (aIndex === -1 && bIndex === -1) return 0;
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;

    return aIndex - bIndex;
  }

  /**
   * 將文檔轉換為搜索結果
   */
  private convertDocumentToSearchResult(
    document: Document,
    originalResults: SearchResult[]
  ): SearchResult {
    // 嘗試找到對應的原始結果
    const originalResult = originalResults.find(
      (result) =>
        result.document.metadata.id === document.metadata.id ||
        result.document.pageContent === document.pageContent
    );

    if (originalResult) {
      return {
        ...originalResult,
        document,
      };
    }

    // 如果找不到，創建新的搜索結果
    return {
      document,
      score: document.metadata.score || 0,
      strategy: "aggregated",
      metadata: {
        searchTime: Date.now(),
        processingTime: 0,
        strategyMetadata: {
          aggregated: true,
        },
      },
    };
  }

  /**
   * 分析結果質量
   */
  analyzeResultQuality(results: SearchResult[]): {
    averageScore: number;
    scoreDistribution: {
      high: number; // > 0.7
      medium: number; // 0.3 - 0.7
      low: number; // < 0.3
    };
    diversityScore: number;
    contentQuality: {
      averageLength: number;
      uniqueDocuments: number;
      duplicateRatio: number;
    };
  } {
    if (results.length === 0) {
      return {
        averageScore: 0,
        scoreDistribution: { high: 0, medium: 0, low: 0 },
        diversityScore: 0,
        contentQuality: {
          averageLength: 0,
          uniqueDocuments: 0,
          duplicateRatio: 0,
        },
      };
    }

    // 計算平均分數
    const averageScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

    // 分數分佈
    const scoreDistribution = {
      high: results.filter((r) => r.score > 0.7).length,
      medium: results.filter((r) => r.score >= 0.3 && r.score <= 0.7).length,
      low: results.filter((r) => r.score < 0.3).length,
    };

    // 多樣性分數（基於策略和來源）
    const uniqueStrategies = new Set(results.map((r) => r.strategy)).size;
    const uniquePaths = new Set(results.map((r) => r.document.metadata.path)).size;
    const diversityScore = (uniqueStrategies + uniquePaths) / (results.length * 2);

    // 內容質量
    const contentLengths = results.map((r) => r.document.pageContent.length);
    const averageLength = contentLengths.reduce((sum, len) => sum + len, 0) / contentLengths.length;
    const uniqueDocuments = new Set(results.map((r) => r.document.pageContent)).size;
    const duplicateRatio = 1 - uniqueDocuments / results.length;

    return {
      averageScore,
      scoreDistribution,
      diversityScore,
      contentQuality: {
        averageLength,
        uniqueDocuments,
        duplicateRatio,
      },
    };
  }

  /**
   * 獲取聚合統計
   */
  getAggregationStats(): {
    totalProcessed: number;
    averageProcessingTime: number;
    normalizationRate: number;
    deduplicationRate: number;
    rerankingRate: number;
  } {
    // 這裡應該從實際的統計系統獲取數據
    // 暫時返回模擬數據
    return {
      totalProcessed: 0,
      averageProcessingTime: 500,
      normalizationRate: 0.8,
      deduplicationRate: 0.3,
      rerankingRate: 0.6,
    };
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<AggregationConfig>): void {
    Object.assign(this.config, newConfig);

    // 更新子組件配置
    this.scoreNormalizer.updateConfig(this.config);
    this.deduplicator.updateConfig(this.config);
    this.ranker.updateConfig(this.config);
  }
}
