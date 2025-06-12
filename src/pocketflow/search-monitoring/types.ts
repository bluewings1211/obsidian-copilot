/**
 * 搜索性能監控和分析系統類型定義
 * 支援統一監控、智能分析、效果評估和預測性維護
 */

// ============================================================================
// 核心監控類型
// ============================================================================

export interface SearchMonitoringEvent {
  id: string;
  timestamp: Date;
  type: SearchEventType;
  component: SearchComponent;
  data: Record<string, any>;
  userId?: string;
  sessionId?: string;
  queryId?: string;
  variantId?: string;
  testId?: string;
}

export enum SearchEventType {
  SEARCH_STARTED = "search_started",
  SEARCH_COMPLETED = "search_completed",
  SEARCH_FAILED = "search_failed",
  RESULT_CLICKED = "result_clicked",
  RESULT_VIEWED = "result_viewed",
  FILTER_APPLIED = "filter_applied",
  RANKING_APPLIED = "ranking_applied",
  PERSONALIZATION_APPLIED = "personalization_applied",
  AGGREGATION_COMPLETED = "aggregation_completed",
  CACHE_HIT = "cache_hit",
  CACHE_MISS = "cache_miss",
}

export enum SearchComponent {
  MAPREDUCE_CORE = "mapreduce_core",
  VECTOR_SEARCH = "vector_search",
  KEYWORD_SEARCH = "keyword_search",
  SEARCH_AGGREGATION = "search_aggregation",
  PERSONALIZATION = "personalization",
  RANKING = "ranking",
  QUALITY_FILTER = "quality_filter",
  CACHE_SYSTEM = "cache_system",
}

// ============================================================================
// 性能指標類型
// ============================================================================

export interface PerformanceMetrics {
  latency: LatencyMetrics;
  throughput: ThroughputMetrics;
  quality: QualityMetrics;
  userExperience: UserExperienceMetrics;
  resources: ResourceMetrics;
  errors: ErrorMetrics;
}

export interface LatencyMetrics {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  mean: number;
  max: number;
  min: number;
}

export interface ThroughputMetrics {
  requestsPerSecond: number;
  queriesPerMinute: number;
  resultsPerSecond: number;
  concurrentUsers: number;
}

export interface QualityMetrics {
  relevanceScore: number;
  precisionAtK: number[];
  recallAtK: number[];
  mrrScore: number;
  ndcgScore: number;
  diversityScore: number;
  duplicateRate: number;
}

export interface UserExperienceMetrics {
  clickThroughRate: number;
  dwellTime: number;
  bounceRate: number;
  searchSatisfaction: number;
  taskCompletionRate: number;
  searchAbandonmentRate: number;
}

export interface ResourceMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskIo: number;
  networkIo: number;
  cacheHitRate: number;
  indexSize: number;
}

export interface ErrorMetrics {
  errorRate: number;
  timeoutRate: number;
  failuresByComponent: Record<SearchComponent, number>;
  recoveryTime: number;
}

// ============================================================================
// A/B 測試和效果評估類型
// ============================================================================

export interface ABTestConfig {
  id: string;
  name: string;
  description: string;
  variants: TestVariant[];
  splitRatio: number[];
  startTime: Date;
  endTime: Date;
  metrics: ABTestMetric[];
  status: ABTestStatus;
}

export interface TestVariant {
  id: string;
  name: string;
  config: Record<string, any>;
  trafficPercentage: number;
}

export enum ABTestStatus {
  DRAFT = "draft",
  RUNNING = "running",
  PAUSED = "paused",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

export interface ABTestMetric {
  name: string;
  type: MetricType;
  target: number;
  significance: number;
}

export enum MetricType {
  CONVERSION_RATE = "conversion_rate",
  CLICK_THROUGH_RATE = "click_through_rate",
  AVERAGE_SESSION_DURATION = "average_session_duration",
  BOUNCE_RATE = "bounce_rate",
  SEARCH_SUCCESS_RATE = "search_success_rate",
}

export interface ABTestResult {
  testId: string;
  variant: string;
  metrics: Record<string, TestMetricResult>;
  statistical: StatisticalResult;
  confidence: number;
  recommendation: TestRecommendation;
}

export interface TestMetricResult {
  value: number;
  change: number;
  pValue: number;
  confidenceInterval: [number, number];
}

export interface StatisticalResult {
  significant: boolean;
  pValue: number;
  effect: number;
  powerAnalysis: PowerAnalysis;
}

export interface PowerAnalysis {
  power: number;
  sampleSize: number;
  effectSize: number;
  alpha: number;
}

export enum TestRecommendation {
  IMPLEMENT = "implement",
  CONTINUE_TESTING = "continue_testing",
  STOP_TESTING = "stop_testing",
  INCONCLUSIVE = "inconclusive",
}

// ============================================================================
// 智能分析和優化類型
// ============================================================================

export interface BottleneckAnalysis {
  component: SearchComponent;
  severity: BottleneckSeverity;
  impact: number;
  description: string;
  recommendations: OptimizationRecommendation[];
  metrics: BottleneckMetrics;
}

export enum BottleneckSeverity {
  CRITICAL = "critical",
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
}

export interface OptimizationRecommendation {
  id: string;
  type: OptimizationType;
  priority: number;
  expectedImpact: number;
  implementation: ImplementationGuide;
  cost: number;
  risk: RiskLevel;
}

export enum OptimizationType {
  CACHING = "caching",
  INDEXING = "indexing",
  PARALLELIZATION = "parallelization",
  ALGORITHM_TUNING = "algorithm_tuning",
  RESOURCE_SCALING = "resource_scaling",
  CONFIGURATION = "configuration",
  ARCHITECTURE = "architecture",
}

export interface ImplementationGuide {
  steps: string[];
  estimatedTime: number;
  requiredResources: string[];
  dependencies: string[];
  rollbackPlan: string[];
}

export enum RiskLevel {
  VERY_LOW = "very_low",
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  VERY_HIGH = "very_high",
}

export interface BottleneckMetrics {
  queueLength: number;
  waitTime: number;
  serviceTime: number;
  utilization: number;
  throughput: number;
}

// ============================================================================
// 用戶行為分析類型
// ============================================================================

export interface UserBehaviorPattern {
  id: string;
  pattern: BehaviorPattern;
  frequency: number;
  userSegment: string;
  timeOfDay: number[];
  queryTypes: QueryType[];
  searchIntent: SearchIntent[];
  satisfaction: number;
}

export enum BehaviorPattern {
  EXPLORATORY = "exploratory",
  FOCUSED = "focused",
  REPEAT_SEARCH = "repeat_search",
  REFINEMENT = "refinement",
  BROWSING = "browsing",
  TASK_ORIENTED = "task_oriented",
}

export enum QueryType {
  INFORMATIONAL = "informational",
  NAVIGATIONAL = "navigational",
  TRANSACTIONAL = "transactional",
  COMPUTATIONAL = "computational",
}

export enum SearchIntent {
  FIND_SPECIFIC = "find_specific",
  EXPLORE_TOPIC = "explore_topic",
  COMPARE_OPTIONS = "compare_options",
  LEARN_ABOUT = "learn_about",
  TROUBLESHOOT = "troubleshoot",
  ENTERTAINMENT = "entertainment",
}

// ============================================================================
// 預測性分析類型
// ============================================================================

export interface PredictionModel {
  id: string;
  name: string;
  type: ModelType;
  features: string[];
  target: string;
  accuracy: number;
  lastTrained: Date;
  version: string;
}

export enum ModelType {
  LINEAR_REGRESSION = "linear_regression",
  DECISION_TREE = "decision_tree",
  RANDOM_FOREST = "random_forest",
  NEURAL_NETWORK = "neural_network",
  TIME_SERIES = "time_series",
  CLUSTERING = "clustering",
}

export interface Prediction {
  timestamp: Date;
  metric: string;
  predictedValue: number;
  confidence: number;
  interval: [number, number];
  horizon: number;
  model: string;
}

export interface TrendAnalysis {
  metric: string;
  trend: TrendDirection;
  strength: number;
  seasonality: SeasonalityPattern;
  changePoints: ChangePoint[];
  forecast: Prediction[];
}

export enum TrendDirection {
  INCREASING = "increasing",
  DECREASING = "decreasing",
  STABLE = "stable",
  CYCLICAL = "cyclical",
  VOLATILE = "volatile",
}

export interface SeasonalityPattern {
  period: number;
  amplitude: number;
  phase: number;
  confidence: number;
}

export interface ChangePoint {
  timestamp: Date;
  magnitude: number;
  direction: "increase" | "decrease";
  confidence: number;
  cause?: string;
}

// ============================================================================
// 監控配置類型
// ============================================================================

export interface MonitoringConfig {
  collection: CollectionConfig;
  storage: StorageConfig;
  analysis: AnalysisConfig;
  alerting: AlertingConfig;
  visualization: VisualizationConfig;
  api: APIConfig;
}

export interface CollectionConfig {
  enabled: boolean;
  sampleRate: number;
  bufferSize: number;
  flushInterval: number;
  retentionPeriod: number;
  components: SearchComponent[];
}

export interface StorageConfig {
  backend: StorageBackend;
  compression: boolean;
  encryption: boolean;
  replication: number;
}

export enum StorageBackend {
  MEMORY = "memory",
  FILE = "file",
  ELASTICSEARCH = "elasticsearch",
  MONGODB = "mongodb",
}

export interface AnalysisConfig {
  realTime: boolean;
  batchSize: number;
  algorithms: AnalysisAlgorithm[];
}

export interface AnalysisAlgorithm {
  name: string;
  enabled: boolean;
  config: Record<string, any>;
}

export interface AlertingConfig {
  enabled: boolean;
  rules: AlertRule[];
  channels: NotificationChannel[];
}

export interface AlertRule {
  id: string;
  name: string;
  condition: AlertCondition;
  severity: AlertSeverity;
  channels: string[];
  enabled: boolean;
  cooldown: number;
}

export interface AlertCondition {
  metric: string;
  operator: ComparisonOperator;
  threshold: number;
  timeWindow: number;
  evaluationFrequency: number;
}

export enum ComparisonOperator {
  GREATER_THAN = "gt",
  LESS_THAN = "lt",
  EQUAL = "eq",
  GREATER_THAN_OR_EQUAL = "gte",
  LESS_THAN_OR_EQUAL = "lte",
  NOT_EQUAL = "ne",
}

export enum AlertSeverity {
  CRITICAL = "critical",
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
  INFO = "info",
}

export interface NotificationChannel {
  type: ChannelType;
  config: Record<string, any>;
}

export enum ChannelType {
  EMAIL = "email",
  SLACK = "slack",
  WEBHOOK = "webhook",
  SMS = "sms",
  CONSOLE = "console",
}

export interface VisualizationConfig {
  dashboard: DashboardConfig;
  charts: ChartConfig[];
  themes: ThemeConfig;
  responsive: boolean;
}

export interface DashboardConfig {
  refreshInterval: number;
  timeRange: TimeRange;
  components: DashboardComponent[];
  alertRules: AlertRule[];
  exportFormats: ExportFormat[];
}

export interface TimeRange {
  start: Date;
  end: Date;
  granularity: TimeGranularity;
}

export enum TimeGranularity {
  SECOND = "second",
  MINUTE = "minute",
  HOUR = "hour",
  DAY = "day",
  WEEK = "week",
  MONTH = "month",
}

export interface DashboardComponent {
  id: string;
  type: DashboardComponentType;
  title: string;
  config: ComponentConfig;
  position: ComponentPosition;
}

export enum DashboardComponentType {
  LINE_CHART = "line_chart",
  BAR_CHART = "bar_chart",
  PIE_CHART = "pie_chart",
  HEATMAP = "heatmap",
  TABLE = "table",
  METRIC_CARD = "metric_card",
  GAUGE = "gauge",
  HISTOGRAM = "histogram",
}

export interface ComponentConfig {
  metrics: string[];
  dimensions: string[];
  filters: Record<string, any>;
  aggregation: AggregationType;
  displayOptions: Record<string, any>;
}

export enum AggregationType {
  SUM = "sum",
  AVERAGE = "average",
  COUNT = "count",
  MAX = "max",
  MIN = "min",
  PERCENTILE = "percentile",
}

export interface ComponentPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartConfig {
  type: DashboardComponentType;
  config: ComponentConfig;
  styling: ChartStyling;
}

export interface ChartStyling {
  colors: string[];
  fonts: FontConfig;
  layout: LayoutConfig;
}

export interface FontConfig {
  family: string;
  size: number;
  weight: string;
}

export interface LayoutConfig {
  margin: number;
  padding: number;
  spacing: number;
}

export interface ThemeConfig {
  name: string;
  colors: ColorPalette;
  dark: boolean;
}

export interface ColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  error: string;
  warning: string;
  success: string;
}

export interface APIConfig {
  enabled: boolean;
  port: number;
  auth: AuthConfig;
  rateLimit: RateLimitConfig;
  cors: CORSConfig;
}

export interface AuthConfig {
  type: AuthType;
  config: Record<string, any>;
}

export enum AuthType {
  NONE = "none",
  API_KEY = "api_key",
  BEARER_TOKEN = "bearer_token",
  BASIC_AUTH = "basic_auth",
  OAUTH = "oauth",
}

export interface RateLimitConfig {
  enabled: boolean;
  requests: number;
  window: number;
  skipSuccessfulRequests: boolean;
}

export interface CORSConfig {
  enabled: boolean;
  origins: string[];
  methods: string[];
  headers: string[];
}

export enum ExportFormat {
  JSON = "json",
  CSV = "csv",
  EXCEL = "excel",
  PDF = "pdf",
  XML = "xml",
}

// ============================================================================
// 輔助類型
// ============================================================================

export interface DashboardData {
  timestamp: Date;
  widgets: WidgetData[];
  layout: DashboardComponent[];
  theme: string;
  status: string;
}

export interface WidgetData {
  id: string;
  type: DashboardComponentType;
  data: any;
  error?: string;
  lastUpdate: Date;
}

export interface MonitoringSummary {
  totalEvents: number;
  avgLatency: number;
  errorRate: number;
  uptime: number;
  activeComponents: number;
  lastUpdate: Date;
}
