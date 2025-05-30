/**
 * MCP Integration Test
 *
 * 這個文件用於測試 MCP 工具系統的整合
 */

import { Notice } from "obsidian";
import { McpToolAdapterManager } from "./tool-adapter";
import { getSettings } from "@/settings/model";
import { ToolManager } from "@/tools/toolManager";

/**
 * 測試 MCP 工具系統整合
 */
export async function testMcpIntegration(): Promise<boolean> {
  try {
    console.log("🧪 Testing MCP integration...");

    // 檢查設定
    const settings = getSettings();
    if (!settings.mcpIntegration.enabled) {
      console.log("❌ MCP integration is disabled in settings");
      return false;
    }

    // 檢查適配器是否初始化
    if (!McpToolAdapterManager.isInitialized()) {
      console.log("❌ MCP Tool Adapter Manager is not initialized");
      return false;
    }

    // 獲取適配器實例
    const adapter = McpToolAdapterManager.getInstance();
    console.log("✅ MCP Tool Adapter Manager is available");

    // 測試獲取工具列表
    const tools = await adapter.getTools();
    console.log(`✅ Retrieved ${tools.length} MCP tools`);

    if (tools.length > 0) {
      console.log("📋 Available MCP tools:");
      tools.forEach((tool, index) => {
        console.log(`  ${index + 1}. ${tool.name} (${tool.serverName}): ${tool.description}`);
      });

      // 測試工具描述
      const firstTool = tools[0];
      const description = await adapter.getToolDescription(firstTool.name);
      console.log(`✅ Tool description for ${firstTool.name}: ${description}`);

      // 測試 ToolManager 整合
      const allTools = await ToolManager.getAllAvailableTools();
      console.log(`✅ ToolManager reports ${allTools.length} total available tools`);

      // 測試 MCP 工具檢測
      const isMcpTool = ToolManager.isMcpTool(firstTool);
      console.log(`✅ MCP tool detection for ${firstTool.name}: ${isMcpTool}`);
    }

    console.log("🎉 MCP integration test completed successfully!");
    new Notice("MCP integration test passed!");
    return true;
  } catch (error) {
    console.error("❌ MCP integration test failed:", error);
    new Notice(`MCP integration test failed: ${error.message}`);
    return false;
  }
}

/**
 * 測試 MCP 工具調用
 */
export async function testMcpToolCall(toolName: string, args: any = {}): Promise<any> {
  try {
    console.log(`🧪 Testing MCP tool call: ${toolName}`);

    if (!McpToolAdapterManager.isInitialized()) {
      throw new Error("MCP Tool Adapter Manager is not initialized");
    }

    const adapter = McpToolAdapterManager.getInstance();
    const tool = await adapter.getTool(toolName);

    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }

    console.log(`📞 Calling tool: ${tool.name} with args:`, args);
    const result = await ToolManager.callTool(tool, args);

    console.log(`✅ Tool call successful. Result:`, result);
    new Notice(`Tool ${toolName} executed successfully`);

    return result;
  } catch (error) {
    console.error(`❌ Tool call failed for ${toolName}:`, error);
    new Notice(`Tool call failed: ${error.message}`);
    throw error;
  }
}

/**
 * 調試 MCP 工具列表
 */
export async function debugMcpTools(): Promise<void> {
  try {
    const settings = getSettings();
    console.log("🔍 MCP Settings:", {
      enabled: settings.mcpIntegration.enabled,
      serverCount: settings.mcpIntegration.servers.length,
      debugMode: settings.mcpIntegration.debugMode,
    });

    if (!McpToolAdapterManager.isInitialized()) {
      console.log("❌ MCP Tool Adapter Manager not initialized");
      return;
    }

    const adapter = McpToolAdapterManager.getInstance();
    const tools = await adapter.getTools();

    console.log("🔍 MCP Tools Debug Info:");
    console.log(`Total tools: ${tools.length}`);

    tools.forEach((tool, index) => {
      console.log(`Tool ${index + 1}:`, {
        name: tool.name,
        mcpToolName: tool.mcpToolName,
        serverId: tool.serverId,
        serverName: tool.serverName,
        description: tool.description,
        inputSchema: tool.inputSchema,
      });
    });
  } catch (error) {
    console.error("❌ Debug failed:", error);
  }
}
