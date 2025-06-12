/**
 * PocketFlow.js Search Aggregation System - Core Types
 * 搜索結果聚合系統的核心類型定義
 */

// ==================== 核心聚合類型 ====================

export interface SearchSource {
  id: string;
  name: string;
  type: "vector" | "keyword" | "hybrid" | "mapreduce";
  weight: number;
  enabled: boolean;
  config?: Record<string, any>;
}

export interface RawSearchResult {
  id: string;
  content: string;
  title?: string;
  source: SearchSource;
  score: number;
  metadata: Record<string, any>;
  timestamp: number;
  relevanceFactors?: RelevanceFactors;
}

export interface NormalizedSearchResult {
  id: string;
  content: string;
  title?: string;
  sources: SearchSource[];
  normalizedScore: number;
  originalScores: Record<string, number>;
  relevanceScore: number;
  qualityScore: number;
  personalizedScore?: number;
  metadata: Record<string, any>;
  timestamp: number;
  aggregationInfo: AggregationInfo;
}

export interface RelevanceFactors {
  textMatch: number;
  semanticSimilarity: number;
  contextRelevance: number;
  freshness: number;
  authority: number;
  userPreference?: number;
}

export interface AggregationInfo {
  totalSources: number;
  processingTime: number;
  confidenceLevel: number;
  qualityIndicators: QualityIndicators;
  deduplicationInfo?: DeduplicationInfo;
}

export interface QualityIndicators {
  contentQuality: number;
  sourceReliability: number;
  relevanceConsistency: number;
  informationDensity: number;
  duplicateRisk: number;
}

export interface DeduplicationInfo {
  duplicateCount: number;
  similarityThreshold: number;
  mergedSources: string[];
  confidence: number;
}

// ==================== 智能排序類型 ====================

export interface RankingContext {
  query: string;
  userContext?: UserContext;
  searchIntent: SearchIntent;
  preferences?: UserPreferences;
  sessionHistory?: SearchSession[];
}

export interface SearchIntent {
  type: "informational" | "navigational" | "transactional" | "exploratory";
  confidence: number;
  entities: string[];
  topics: string[];
  urgency: "low" | "medium" | "high";
}

export interface RankingFactors {
  relevance: number;
  quality: number;
  freshness: number;
  diversity: number;
  personalization: number;
  authority: number;
  coherence: number;
  completeness: number;
}

export interface RankingStrategy {
  id: string;
  name: string;
  description: string;
  factorWeights: Partial<RankingFactors>;
  contextAdaptive: boolean;
  execute: (
    results: NormalizedSearchResult[],
    context: RankingContext
  ) => Promise<NormalizedSearchResult[]>;
}

// ==================== 個性化類型 ====================

export interface UserContext {
  userId?: string;
  sessionId: string;
  preferences: UserPreferences;
  behavior: UserBehavior;
  profile: UserProfile;
}

export interface UserPreferences {
  contentTypes: string[];
  topics: string[];
  sources: string[];
  languages: string[];
  recency: "any" | "recent" | "latest";
  depth: "overview" | "detailed" | "comprehensive";
  format: "text" | "multimedia" | "structured";
}

export interface UserBehavior {
  searchHistory: SearchHistory[];
  clickPatterns: ClickPattern[];
  dwellTime: DwellTimeData[];
  feedbackHistory: FeedbackHistory[];
  interactionPatterns: InteractionPattern[];
}

export interface UserProfile {
  expertiseLevel: "beginner" | "intermediate" | "expert";
  domains: string[];
  interests: string[];
  learningStyle: "visual" | "textual" | "interactive";
  activityLevel: "low" | "medium" | "high";
}

export interface SearchHistory {
  query: string;
  timestamp: number;
  resultClicks: string[];
  sessionDuration: number;
  satisfaction?: number;
}

export interface ClickPattern {
  resultId: string;
  position: number;
  dwellTime: number;
  timestamp: number;
  follow_up_queries?: string[];
}

export interface DwellTimeData {
  resultId: string;
  timeSpent: number;
  engagement: "low" | "medium" | "high";
  bounce: boolean;
}

export interface FeedbackHistory {
  resultId: string;
  feedback: "positive" | "negative" | "neutral";
  reason?: string;
  timestamp: number;
}

export interface InteractionPattern {
  type: "click" | "hover" | "scroll" | "bookmark" | "share";
  target: string;
  context: Record<string, any>;
  timestamp: number;
}

export interface SearchSession {
  sessionId: string;
  queries: string[];
  results: string[];
  startTime: number;
  endTime: number;
  satisfaction?: number;
}

// ==================== 質量控制類型 ====================

export interface QualityAssessment {
  contentQuality: ContentQuality;
  sourceReliability: SourceReliability;
  informationAccuracy: InformationAccuracy;
  relevanceConsistency: RelevanceConsistency;
}

export interface ContentQuality {
  score: number;
  factors: {
    length: number;
    structure: number;
    language: number;
    formatting: number;
    completeness: number;
  };
  issues: string[];
}

export interface SourceReliability {
  score: number;
  factors: {
    authority: number;
    freshness: number;
    citations: number;
    consistency: number;
  };
  trustLevel: "low" | "medium" | "high";
}

export interface InformationAccuracy {
  score: number;
  verificationLevel: "unverified" | "partial" | "verified";
  contradictions: string[];
  supportingEvidence: string[];
}

export interface RelevanceConsistency {
  score: number;
  crossSourceAgreement: number;
  topicAlignment: number;
  contextFit: number;
}

export interface DuplicationDetection {
  similarity: number;
  type: "exact" | "near" | "semantic" | "structural";
  confidence: number;
  mergeRecommendation: boolean;
}

export interface SpamDetection {
  isSpam: boolean;
  confidence: number;
  indicators: string[];
  riskLevel: "low" | "medium" | "high";
}

// ==================== 監控類型 ====================

export interface AggregationMetrics {
  processingTime: number;
  sourceContributions: Record<string, number>;
  qualityDistribution: QualityDistribution;
  userSatisfaction: number;
  errorRate: number;
  throughput: number;
}

export interface QualityDistribution {
  high: number;
  medium: number;
  low: number;
  spam: number;
}

export interface RankingPerformance {
  algorithmEfficiency: Record<string, number>;
  personalizedAccuracy: number;
  diversityScore: number;
  freshnessBias: number;
  userEngagement: number;
}

export interface PersonalizationEffectiveness {
  hitRate: number;
  satisfactionImprovement: number;
  engagementIncrease: number;
  adaptationSpeed: number;
  bias: BiasMetrics;
}

export interface BiasMetrics {
  sourceBias: number;
  topicBias: number;
  recencyBias: number;
  popularityBias: number;
}

export interface SystemHealth {
  uptime: number;
  responseTime: number;
  errorRate: number;
  resourceUsage: ResourceUsage;
  bottlenecks: string[];
}

export interface ResourceUsage {
  cpu: number;
  memory: number;
  network: number;
  storage: number;
}

// ==================== 配置類型 ====================

export interface SearchAggregationConfig {
  core: CoreAggregationConfig;
  ranking: RankingConfig;
  personalization: PersonalizationConfig;
  quality: QualityConfig;
  monitoring: MonitoringConfig;
}

export interface CoreAggregationConfig {
  maxResults: number;
  normalizeScores: boolean;
  enableDeduplication: boolean;
  aggregationTimeout: number;
  parallelProcessing: boolean;
  caching: CachingConfig;
}

export interface CachingConfig {
  enabled: boolean;
  ttl: number;
  maxSize: number;
  strategy: "lru" | "lfu" | "ttl";
}

export interface RankingConfig {
  defaultStrategy: string;
  enableAdaptive: boolean;
  diversityThreshold: number;
  qualityThreshold: number;
  contextWeight: number;
  strategies: RankingStrategy[];
}

export interface PersonalizationConfig {
  enabled: boolean;
  adaptationRate: number;
  historyDepth: number;
  privacyLevel: "strict" | "balanced" | "permissive";
  biasCorrection: boolean;
}

export interface QualityConfig {
  enableQualityAssessment: boolean;
  enableSpamDetection: boolean;
  enableDeduplication: boolean;
  qualityThresholds: QualityThresholds;
  deduplicationThreshold: number;
  spamThreshold: number;
}

export interface QualityThresholds {
  content: number;
  source: number;
  relevance: number;
  overall: number;
}

export interface MonitoringConfig {
  enableRealTimeMonitoring: boolean;
  enablePerformanceAnalytics: boolean;
  enableAlerts: boolean;
  reportingInterval: number;
  retentionPeriod: number;
}

// ==================== 事件類型 ====================

export interface SearchAggregationEvent {
  type: SearchAggregationEventType;
  timestamp: number;
  data: Record<string, any>;
  metadata?: Record<string, any>;
}

export type SearchAggregationEventType =
  | "aggregation_started"
  | "source_processed"
  | "results_normalized"
  | "ranking_completed"
  | "personalization_applied"
  | "quality_assessed"
  | "deduplication_completed"
  | "aggregation_completed"
  | "error_occurred"
  | "performance_threshold_exceeded";

// ==================== 錯誤類型 ====================

export class SearchAggregationError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = "SearchAggregationError";
  }
}

export class RankingError extends SearchAggregationError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, "RANKING_ERROR", context);
    this.name = "RankingError";
  }
}

export class PersonalizationError extends SearchAggregationError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, "PERSONALIZATION_ERROR", context);
    this.name = "PersonalizationError";
  }
}

export class QualityAssessmentError extends SearchAggregationError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, "QUALITY_ASSESSMENT_ERROR", context);
    this.name = "QualityAssessmentError";
  }
}
