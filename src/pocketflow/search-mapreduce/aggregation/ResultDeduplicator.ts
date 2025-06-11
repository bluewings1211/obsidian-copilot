/**
 * 結果去重器 - 處理重複的搜索結果
 */

import { Document } from "@langchain/core/documents";
import type { SearchResult, AggregationConfig, DeduplicationResult } from "../types";

export class ResultDeduplicator {
  constructor(private config: AggregationConfig) {}

  /**
   * 去重搜索結果
   */
  async deduplicateResults(results: SearchResult[]): Promise<DeduplicationResult> {
    const startTime = Date.now();

    if (results.length === 0) {
      return {
        uniqueResults: [],
        duplicatesRemoved: 0,
        deduplicationTime: Date.now() - startTime,
      };
    }

    const uniqueResults: SearchResult[] = [];
    const seenHashes = new Set<string>();
    let duplicatesRemoved = 0;

    for (const result of results) {
      const hash = this.calculateDocumentHash(result.document);

      if (!seenHashes.has(hash)) {
        seenHashes.add(hash);
        uniqueResults.push(result);
      } else {
        // 找到重複項，比較分數保留更好的
        const existingIndex = uniqueResults.findIndex(
          (r) => this.calculateDocumentHash(r.document) === hash
        );

        if (existingIndex !== -1 && result.score > uniqueResults[existingIndex].score) {
          uniqueResults[existingIndex] = result;
        }
        duplicatesRemoved++;
      }
    }

    return {
      uniqueResults,
      duplicatesRemoved,
      deduplicationTime: Date.now() - startTime,
    };
  }

  /**
   * 計算文檔哈希值
   */
  private calculateDocumentHash(document: Document): string {
    // 基於內容和關鍵元數據生成哈希
    const contentHash = this.simpleHash(document.pageContent);
    const pathHash = document.metadata.path ? this.simpleHash(document.metadata.path) : "";
    const idHash = document.metadata.id ? this.simpleHash(document.metadata.id) : "";

    return `${contentHash}_${pathHash}_${idHash}`;
  }

  /**
   * 簡單哈希函數
   */
  private simpleHash(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString();

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 轉換為32位整數
    }

    return Math.abs(hash).toString(36);
  }

  /**
   * 計算內容相似度
   */
  private calculateContentSimilarity(content1: string, content2: string): number {
    // 簡化的 Jaccard 相似度
    const words1 = new Set(content1.toLowerCase().split(/\s+/));
    const words2 = new Set(content2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * 高級去重（基於相似度）
   */
  async advancedDeduplication(results: SearchResult[]): Promise<DeduplicationResult> {
    const startTime = Date.now();
    const threshold = this.config.deduplicationThreshold || 0.85;

    const uniqueResults: SearchResult[] = [];
    let duplicatesRemoved = 0;

    for (const result of results) {
      let isDuplicate = false;

      for (let i = 0; i < uniqueResults.length; i++) {
        const similarity = this.calculateContentSimilarity(
          result.document.pageContent,
          uniqueResults[i].document.pageContent
        );

        if (similarity >= threshold) {
          isDuplicate = true;
          // 保留分數更高的結果
          if (result.score > uniqueResults[i].score) {
            uniqueResults[i] = result;
          }
          duplicatesRemoved++;
          break;
        }
      }

      if (!isDuplicate) {
        uniqueResults.push(result);
      }
    }

    return {
      uniqueResults,
      duplicatesRemoved,
      deduplicationTime: Date.now() - startTime,
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: AggregationConfig): void {
    this.config = config;
  }
}
