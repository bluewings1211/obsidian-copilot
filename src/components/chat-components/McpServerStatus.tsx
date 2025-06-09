import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getSettings } from "@/settings/model";
import { McpToolAdapterManager } from "@/mcp/tool-adapter";
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Server,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import React, { useState, useEffect } from "react";

interface McpServerInfo {
  id: string;
  name: string;
  status: "connected" | "connecting" | "disconnected" | "error";
  toolCount: number;
  tools: Array<{ name: string; description: string }>;
  lastConnected?: Date;
  error?: string;
}

interface McpServerStatusProps {
  className?: string;
}

/**
 * 顯示單個 MCP 服務器狀態的組件
 */
const McpServerItem: React.FC<{ server: McpServerInfo }> = ({ server }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatusIcon = () => {
    switch (server.status) {
      case "connected":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "connecting":
        return <Clock className="w-4 h-4 text-blue-500 animate-spin" />;
      case "disconnected":
        return <WifiOff className="w-4 h-4 text-gray-500" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusBadge = () => {
    const baseClasses = "text-xs font-medium";
    switch (server.status) {
      case "connected":
        return (
          <Badge variant="secondary" className={cn(baseClasses, "bg-green-100 text-green-800")}>
            已連接
          </Badge>
        );
      case "connecting":
        return (
          <Badge variant="secondary" className={cn(baseClasses, "bg-blue-100 text-blue-800")}>
            連接中
          </Badge>
        );
      case "disconnected":
        return (
          <Badge variant="secondary" className={cn(baseClasses, "bg-gray-100 text-gray-800")}>
            未連接
          </Badge>
        );
      case "error":
        return (
          <Badge variant="secondary" className={cn(baseClasses, "bg-red-100 text-red-800")}>
            錯誤
          </Badge>
        );
    }
  };

  return (
    <div className="border border-border rounded-md p-3 space-y-2 bg-background/50">
      {/* 服務器標題和狀態 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="font-medium text-sm">{server.name}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-xs">
                <Zap className="w-3 h-3 mr-1" />
                {server.toolCount}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>{server.toolCount} 個可用工具</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge()}
          {server.lastConnected && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs text-muted-foreground">
                  {server.lastConnected.toLocaleTimeString()}
                </span>
              </TooltipTrigger>
              <TooltipContent>最後連接時間</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* 錯誤訊息 */}
      {server.status === "error" && server.error && (
        <div className="text-xs text-red-600 bg-red-50 p-2 rounded">{server.error}</div>
      )}

      {/* 可摺疊的工具列表 */}
      {server.toolCount > 0 && (
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-start p-0 h-auto">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 mr-1" />
              ) : (
                <ChevronRight className="w-4 h-4 mr-1" />
              )}
              <span className="text-xs text-muted-foreground">
                {isExpanded ? "隱藏工具列表" : `顯示 ${server.toolCount} 個工具`}
              </span>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1 mt-2">
            {server.tools.map((tool, index) => (
              <div key={index} className="text-xs bg-muted p-2 rounded">
                <div className="font-medium">{tool.name}</div>
                {tool.description && (
                  <div className="text-muted-foreground mt-1">{tool.description}</div>
                )}
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};

/**
 * MCP 服務器狀態顯示主組件
 * 改進：只在聊天界面頂部顯示，避免與工具調用狀態重複
 */
export const McpServerStatus: React.FC<McpServerStatusProps> = ({ className }) => {
  const [isExpanded, setIsExpanded] = useState(false); // 默認收起以減少干擾
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadServerStatus();

    // 每 30 秒更新一次狀態
    const interval = setInterval(loadServerStatus, 30000);

    return () => clearInterval(interval);
  }, []);

  const loadServerStatus = async () => {
    try {
      const settings = getSettings();

      // 如果 MCP 整合未啟用，不顯示狀態
      if (!settings.mcpIntegration.enabled) {
        setServers([]);
        setIsLoading(false);
        return;
      }

      // 如果 McpToolAdapterManager 未初始化，顯示未連接狀態
      if (!McpToolAdapterManager.isInitialized()) {
        setServers([
          {
            id: "not-initialized",
            name: "MCP 服務",
            status: "disconnected",
            toolCount: 0,
            tools: [],
            error: "MCP Tool Adapter Manager 尚未初始化",
          },
        ]);
        setIsLoading(false);
        return;
      }

      const adapter = McpToolAdapterManager.getInstance();

      try {
        // 獲取所有可用工具
        const tools = await adapter.getTools();

        // 按服務器分組工具
        const serverMap = new Map<string, McpServerInfo>();

        for (const tool of tools) {
          const serverId = tool.serverId || "unknown";
          const serverName = tool.serverName || `服務器 ${serverId}`;

          if (!serverMap.has(serverId)) {
            serverMap.set(serverId, {
              id: serverId,
              name: serverName,
              status: "connected",
              toolCount: 0,
              tools: [],
              lastConnected: new Date(),
            });
          }

          const serverInfo = serverMap.get(serverId)!;
          serverInfo.toolCount++;
          serverInfo.tools.push({
            name: tool.name,
            description: tool.description || "無描述",
          });
        }

        setServers(Array.from(serverMap.values()));
      } catch (error) {
        console.error("Failed to load MCP server status:", error);
        setServers([
          {
            id: "error",
            name: "MCP 服務",
            status: "error",
            toolCount: 0,
            tools: [],
            error: `載入失敗: ${error.message}`,
          },
        ]);
      }
    } catch (error) {
      console.error("Error loading server status:", error);
      setServers([]);
    } finally {
      setIsLoading(false);
    }
  };

  // 如果正在載入，顯示載入狀態
  if (isLoading) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="border border-border rounded-md p-3 bg-background/50">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-500 animate-spin" />
            <span className="text-sm">載入 MCP 服務器狀態...</span>
          </div>
        </div>
      </div>
    );
  }

  // 如果沒有服務器，不顯示
  if (servers.length === 0) {
    return null;
  }

  const connectedCount = servers.filter((s) => s.status === "connected").length;
  const errorCount = servers.filter((s) => s.status === "error").length;
  const totalTools = servers.reduce((sum, s) => sum + s.toolCount, 0);

  return (
    <div className={cn("space-y-2", className)}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-start p-2 h-auto border border-border rounded-md bg-background/30 hover:bg-background/50"
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <Server className="w-4 h-4" />
                <span className="text-sm font-medium">MCP 系統狀態</span>
                <Badge variant="secondary" className="text-xs">
                  {servers.length} 個服務器
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                {connectedCount > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                        <Wifi className="w-3 h-3 mr-1" />
                        {connectedCount}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>{connectedCount} 個服務器已連接</TooltipContent>
                  </Tooltip>
                )}
                {totalTools > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">
                        <Zap className="w-3 h-3 mr-1" />
                        {totalTools}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>{totalTools} 個工具可用</TooltipContent>
                  </Tooltip>
                )}
                {errorCount > 0 && (
                  <Badge variant="secondary" className="text-xs bg-red-100 text-red-800">
                    錯誤: {errorCount}
                  </Badge>
                )}
              </div>
            </div>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2">
          <div className="text-xs text-muted-foreground px-2 mb-2">
            💡 提示：具體的工具調用結果會顯示在相關消息中
          </div>
          {servers.map((server) => (
            <McpServerItem key={server.id} server={server} />
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default McpServerStatus;
