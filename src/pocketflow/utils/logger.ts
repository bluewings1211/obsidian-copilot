/**
 * PocketFlow 日誌工具
 *
 * 提供統一的日誌記錄功能
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * 日誌配置
 */
interface LogConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableDebug: boolean;
}

let logConfig: LogConfig = {
  level: "info",
  enableConsole: true,
  enableDebug: false,
};

/**
 * 設置日誌配置
 */
export function setLogConfig(config: Partial<LogConfig>): void {
  logConfig = { ...logConfig, ...config };
}

/**
 * 獲取當前日誌配置
 */
export function getLogConfig(): LogConfig {
  return { ...logConfig };
}

/**
 * 日誌級別優先級
 */
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * 檢查是否應該記錄該級別的日誌
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[logConfig.level];
}

/**
 * 格式化日誌消息
 */
function formatMessage(level: LogLevel, message: string, data?: any): string {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

  if (data !== undefined) {
    const dataStr = typeof data === "object" ? JSON.stringify(data, null, 2) : String(data);
    return `${prefix} ${message}\n${dataStr}`;
  }

  return `${prefix} ${message}`;
}

/**
 * 通用日誌記錄函數
 */
function log(level: LogLevel, message: string, data?: any): void {
  if (!shouldLog(level) || !logConfig.enableConsole) {
    return;
  }

  const formattedMessage = formatMessage(level, message, data);

  switch (level) {
    case "debug":
      if (logConfig.enableDebug) {
        console.debug(formattedMessage);
      }
      break;
    case "info":
      console.info(formattedMessage);
      break;
    case "warn":
      console.warn(formattedMessage);
      break;
    case "error":
      console.error(formattedMessage);
      break;
  }
}

/**
 * 調試日誌
 */
export function logDebug(message: string, data?: any): void {
  log("debug", message, data);
}

/**
 * 信息日誌
 */
export function logInfo(message: string, data?: any): void {
  log("info", message, data);
}

/**
 * 警告日誌
 */
export function logWarn(message: string, data?: any): void {
  log("warn", message, data);
}

/**
 * 錯誤日誌
 */
export function logError(message: string, error?: any, data?: any): void {
  const errorInfo =
    error instanceof Error
      ? { message: error.message, stack: error.stack, name: error.name }
      : error;

  const logData = data ? { error: errorInfo, ...data } : errorInfo;
  log("error", message, logData);
}

/**
 * 創建帶前綴的日誌記錄器
 */
export function createLogger(prefix: string) {
  return {
    debug: (message: string, data?: any) => logDebug(`[${prefix}] ${message}`, data),
    info: (message: string, data?: any) => logInfo(`[${prefix}] ${message}`, data),
    warn: (message: string, data?: any) => logWarn(`[${prefix}] ${message}`, data),
    error: (message: string, error?: any, data?: any) =>
      logError(`[${prefix}] ${message}`, error, data),
  };
}

/**
 * 性能日誌工具
 */
export class PerformanceLogger {
  private startTime: number;
  private label: string;

  constructor(label: string) {
    this.label = label;
    this.startTime = performance.now();
    logDebug(`性能測量開始: ${label}`);
  }

  /**
   * 記錄中間點
   */
  public checkpoint(message: string): void {
    const elapsed = performance.now() - this.startTime;
    logDebug(`${this.label} - ${message}: ${elapsed.toFixed(2)}ms`);
  }

  /**
   * 完成測量
   */
  public end(message?: string): number {
    const elapsed = performance.now() - this.startTime;
    const finalMessage = message || "完成";
    logInfo(`${this.label} - ${finalMessage}: ${elapsed.toFixed(2)}ms`);
    return elapsed;
  }
}

/**
 * 創建性能日誌記錄器
 */
export function createPerformanceLogger(label: string): PerformanceLogger {
  return new PerformanceLogger(label);
}
