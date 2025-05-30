/**
 * MCP Chat UI Integration Test
 *
 * 用於測試 MCP 工具在聊天介面中的顯示和功能
 */

import { McpToolCall } from "@/sharedState";
import { McpToolCallTracker } from "./tool-call-tracker";

/**
 * 創建測試用的 MCP 工具調用
 */
export function createTestMcpToolCall(): McpToolCall {
  return {
    toolName: "mcp_weather_get_forecast",
    originalToolName: "get_forecast",
    serverName: "Weather Server",
    serverId: "weather-server-1",
    arguments: {
      location: "Taiwan",
      days: 3,
    },
    status: "pending",
    startTime: Date.now(),
  };
}

/**
 * 創建多個測試工具調用
 */
export function createTestMcpToolCalls(): McpToolCall[] {
  return [
    {
      toolName: "mcp_weather_get_forecast",
      originalToolName: "get_forecast",
      serverName: "Weather Server",
      serverId: "weather-server-1",
      arguments: {
        location: "Taiwan",
        days: 3,
      },
      status: "success",
      startTime: Date.now() - 5000,
      endTime: Date.now() - 2000,
      duration: 3000,
      result: {
        location: "Taiwan",
        forecast: [
          { date: "2025-05-30", temperature: "25°C", condition: "Sunny" },
          { date: "2025-05-31", temperature: "28°C", condition: "Cloudy" },
          { date: "2025-06-01", temperature: "22°C", condition: "Rainy" },
        ],
      },
    },
    {
      toolName: "mcp_database_query",
      originalToolName: "execute_query",
      serverName: "Database Server",
      serverId: "db-server-1",
      arguments: {
        sql: "SELECT * FROM users WHERE active = true",
        limit: 10,
      },
      status: "error",
      startTime: Date.now() - 8000,
      endTime: Date.now() - 7000,
      duration: 1000,
      error: "Database connection timeout",
    },
    {
      toolName: "mcp_filesystem_read",
      originalToolName: "read_file",
      serverName: "File System Server",
      serverId: "fs-server-1",
      arguments: {
        path: "/Users/test/document.txt",
        encoding: "utf-8",
      },
      status: "pending",
      startTime: Date.now(),
    },
  ];
}

/**
 * 模擬 MCP 工具調用流程
 */
export async function simulateMcpToolCall(
  messageIndex: number = 0,
  toolCallIndex: number = 0
): Promise<string> {
  const toolCall = createTestMcpToolCall();

  // 開始跟蹤
  const trackingId = McpToolCallTracker.startTracking(messageIndex, toolCallIndex, toolCall);

  // 模擬執行延遲
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // 模擬成功或失敗（50% 機率）
  if (Math.random() > 0.5) {
    McpToolCallTracker.completeCall(trackingId, {
      location: "Taiwan",
      temperature: "25°C",
      condition: "Sunny",
      forecast: "Clear skies for the next 3 days",
    });
  } else {
    McpToolCallTracker.failCall(trackingId, "Weather service temporarily unavailable");
  }

  return trackingId;
}

/**
 * 測試多個工具調用
 */
export async function simulateMultipleMcpToolCalls(messageIndex: number = 0): Promise<string[]> {
  const trackingIds: string[] = [];

  // 天氣工具
  const weatherId = McpToolCallTracker.startTracking(messageIndex, 0, {
    toolName: "mcp_weather_get_forecast",
    originalToolName: "get_forecast",
    serverName: "Weather Server",
    serverId: "weather-server-1",
    arguments: { location: "Taiwan" },
  });
  trackingIds.push(weatherId);

  // 數據庫工具
  const dbId = McpToolCallTracker.startTracking(messageIndex, 1, {
    toolName: "mcp_database_query",
    originalToolName: "execute_query",
    serverName: "Database Server",
    serverId: "db-server-1",
    arguments: { query: "SELECT * FROM weather_data" },
  });
  trackingIds.push(dbId);

  // 檔案系統工具
  const fsId = McpToolCallTracker.startTracking(messageIndex, 2, {
    toolName: "mcp_filesystem_list",
    originalToolName: "list_directory",
    serverName: "File System Server",
    serverId: "fs-server-1",
    arguments: { path: "/weather/data" },
  });
  trackingIds.push(fsId);

  // 模擬異步完成
  setTimeout(() => {
    McpToolCallTracker.completeCall(weatherId, {
      temperature: "25°C",
      condition: "Sunny",
      humidity: "60%",
    });
  }, 1000);

  setTimeout(() => {
    McpToolCallTracker.failCall(dbId, "Connection timeout");
  }, 1500);

  setTimeout(() => {
    McpToolCallTracker.completeCall(fsId, {
      files: ["temperature.log", "humidity.log", "pressure.log"],
      count: 3,
    });
  }, 2000);

  return trackingIds;
}

/**
 * 在開發者控制台中測試 MCP UI
 */
export function testMcpChatUI() {
  console.log("=== MCP Chat UI Test ===");

  // 測試單個工具調用
  console.log("Testing single tool call...");
  simulateMcpToolCall(0, 0).then((id) => {
    console.log("Single tool call tracking ID:", id);
  });

  // 測試多個工具調用
  setTimeout(() => {
    console.log("Testing multiple tool calls...");
    simulateMultipleMcpToolCalls(1).then((ids) => {
      console.log("Multiple tool calls tracking IDs:", ids);
    });
  }, 3000);

  // 顯示當前活躍的調用
  setTimeout(() => {
    console.log("Active calls:", McpToolCallTracker.getActiveCalls());
  }, 5000);
}

/**
 * 清理測試資料
 */
export function cleanupMcpTestData() {
  McpToolCallTracker.clearAll();
  console.log("MCP test data cleared");
}

// 在開發環境中添加到全域物件
if (typeof window !== "undefined") {
  (window as any).testMcpChatUI = testMcpChatUI;
  (window as any).cleanupMcpTestData = cleanupMcpTestData;
  (window as any).simulateMcpToolCall = simulateMcpToolCall;
  (window as any).simulateMultipleMcpToolCalls = simulateMultipleMcpToolCalls;
}
