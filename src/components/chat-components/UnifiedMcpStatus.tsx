import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getSettings } from "@/settings/model";
import { McpToolAdapterManager } from "@/mcp/tool-adapter";
import { McpToolCall } from "@/sharedState";
import { safeStringify } from "@/mcp/utils";
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Server,
  Settings,
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

interface UnifiedMcpStatusProps {
  className?: string;
  toolCalls?: McpToolCall[]; // 如果提供了 toolCalls，則顯示工具調用模式
  showServerStatus?: boolean; // 是否顯示服務器狀態（默認 true）
}

/**
 * 統一的 MCP 狀態組件，可以同時顯示服務器狀態和工具調用
 */
export const UnifiedMcpStatus: React.FC<UnifiedMcpStatusProps> = ({
  className,
  toolCalls,
  showServerStatus = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (showServerStatus) {
      loadServerStatus();
      // 每 30 秒更新一次狀態
      const interval = setInterval(loadServerStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [showServerStatus]);

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

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  };

  const formatDuration = (duration?: number) => {
    if (!duration) return "N/A";
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(2)}s`;
  };

  const formatArguments = (args: any) => {
    if (!args || Object.keys(args).length === 0) return "無參數";
    return safeStringify(args, 2);
  };

  const formatResult = (result: any) => {
    if (result === null || result === undefined) return "無結果";
    if (typeof result === "string") return result;
    return safeStringify(result, 2);
  };

  // 渲染工具調用項目
  const ToolCallItem: React.FC<{ toolCall: McpToolCall; index: number }> = ({
    toolCall,
    index,
  }) => {
    const [isToolExpanded, setIsToolExpanded] = useState(false);

    const getStatusIcon = () => {
      switch (toolCall.status) {
        case "pending":
          return <Clock className="w-4 h-4 text-blue-500 animate-spin" />;
        case "success":
          return <CheckCircle className="w-4 h-4 text-green-500" />;
        case "error":
          return <AlertCircle className="w-4 h-4 text-red-500" />;
      }
    };

    const getStatusBadge = () => {
      const baseClasses = "text-xs font-medium";
      switch (toolCall.status) {
        case "pending":
          return (
            <Badge variant="secondary" className={cn(baseClasses, "bg-blue-100 text-blue-800")}>
              執行中
            </Badge>
          );
        case "success":
          return (
            <Badge variant="secondary" className={cn(baseClasses, "bg-green-100 text-green-800")}>
              成功
            </Badge>
          );
        case "error":
          return (
            <Badge variant="secondary" className={cn(baseClasses, "bg-red-100 text-red-800")}>
              失敗
            </Badge>
          );
      }
    };

    return (
      <div key={index} className="border border-border rounded-md p-3 space-y-2 bg-background/50">
        {/* 工具標題和狀態 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <span className="font-medium text-sm">{toolCall.originalToolName}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-xs">
                  <Server className="w-3 h-3 mr-1" />
                  {toolCall.serverName}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>MCP 伺服器: {toolCall.serverName}</p>
                <p>伺服器 ID: {toolCall.serverId}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge()}
            {toolCall.duration && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="text-xs">
                    <Zap className="w-3 h-3 mr-1" />
                    {formatDuration(toolCall.duration)}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>執行時間</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* 可摺疊的詳細資訊 */}
        <Collapsible open={isToolExpanded} onOpenChange={setIsToolExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-start p-0 h-auto">
              {isToolExpanded ? (
                <ChevronDown className="w-4 h-4 mr-1" />
              ) : (
                <ChevronRight className="w-4 h-4 mr-1" />
              )}
              <span className="text-xs text-muted-foreground">
                {isToolExpanded ? "隱藏詳細資訊" : "顯示詳細資訊"}
              </span>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 mt-2">
            {/* 工具參數 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">參數:</label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-1"
                  onClick={() =>
                    copyToClipboard(formatArguments(toolCall.arguments), `args-${index}`)
                  }
                >
                  <Copy className="w-3 h-3" />
                  {copiedField === `args-${index}` && <span className="ml-1 text-xs">已複製</span>}
                </Button>
              </div>
              <pre className="text-xs bg-muted p-2 rounded text-muted-foreground overflow-x-auto">
                {formatArguments(toolCall.arguments)}
              </pre>
            </div>

            {/* 執行結果或錯誤 */}
            {toolCall.status === "success" && toolCall.result && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">結果:</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-1"
                    onClick={() =>
                      copyToClipboard(formatResult(toolCall.result), `result-${index}`)
                    }
                  >
                    <Copy className="w-3 h-3" />
                    {copiedField === `result-${index}` && (
                      <span className="ml-1 text-xs">已複製</span>
                    )}
                  </Button>
                </div>
                <pre className="text-xs bg-muted p-2 rounded text-muted-foreground overflow-x-auto max-h-32 overflow-y-auto">
                  {formatResult(toolCall.result)}
                </pre>
              </div>
            )}

            {toolCall.status === "error" && toolCall.error && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-red-600">錯誤:</label>
                <pre className="text-xs bg-red-50 text-red-800 p-2 rounded overflow-x-auto">
                  {toolCall.error}
                </pre>
              </div>
            )}

            {/* 時間資訊 */}
            <div className="text-xs text-muted-foreground space-y-1">
              <div>開始時間: {new Date(toolCall.startTime).toLocaleTimeString()}</div>
              {toolCall.endTime && (
                <div>結束時間: {new Date(toolCall.endTime).toLocaleTimeString()}</div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  };

  // 渲染服務器項目
  const ServerItem: React.FC<{ server: McpServerInfo }> = ({ server }) => {
    const [isServerExpanded, setIsServerExpanded] = useState(false);

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
      <div
        key={server.id}
        className="border border-border rounded-md p-3 space-y-2 bg-background/50"
      >
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
          <Collapsible open={isServerExpanded} onOpenChange={setIsServerExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-start p-0 h-auto">
                {isServerExpanded ? (
                  <ChevronDown className="w-4 h-4 mr-1" />
                ) : (
                  <ChevronRight className="w-4 h-4 mr-1" />
                )}
                <span className="text-xs text-muted-foreground">
                  {isServerExpanded ? "隱藏工具列表" : `顯示 ${server.toolCount} 個工具`}
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

  // 決定顯示模式
  const hasToolCalls = toolCalls && toolCalls.length > 0;
  const hasServers = servers.length > 0;

  // 如果正在載入，顯示載入狀態
  if (showServerStatus && isLoading) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="border border-border rounded-md p-3 bg-background/50">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-500 animate-spin" />
            <span className="text-sm">載入 MCP 狀態...</span>
          </div>
        </div>
      </div>
    );
  }

  // 如果沒有工具調用也沒有服務器，不顯示
  if (!hasToolCalls && !hasServers) {
    return null;
  }

  // 計算統計資訊
  const pendingCount = toolCalls?.filter((call) => call.status === "pending").length || 0;
  const successCount = toolCalls?.filter((call) => call.status === "success").length || 0;
  const errorCount = toolCalls?.filter((call) => call.status === "error").length || 0;
  const connectedCount = servers.filter((s) => s.status === "connected").length;
  const totalTools = servers.reduce((sum, s) => sum + s.toolCount, 0);

  // 主標題和圖標
  const mainTitle = hasToolCalls ? "MCP 工具調用" : "MCP 服務器";
  const mainIcon = hasToolCalls ? <Settings className="w-4 h-4" /> : <Server className="w-4 h-4" />;
  const mainCount = hasToolCalls ? toolCalls.length : servers.length;

  return (
    <div className={cn("space-y-2", className)}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-start p-2 h-auto border border-border rounded-md bg-background/30"
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                {mainIcon}
                <span className="text-sm font-medium">{mainTitle}</span>
                <Badge variant="secondary" className="text-xs">
                  {mainCount}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                {/* 工具調用狀態 */}
                {hasToolCalls && (
                  <>
                    {pendingCount > 0 && (
                      <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">
                        執行中: {pendingCount}
                      </Badge>
                    )}
                    {successCount > 0 && (
                      <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                        成功: {successCount}
                      </Badge>
                    )}
                    {errorCount > 0 && (
                      <Badge variant="secondary" className="text-xs bg-red-100 text-red-800">
                        失敗: {errorCount}
                      </Badge>
                    )}
                  </>
                )}
                {/* 服務器狀態 */}
                {showServerStatus && hasServers && (
                  <>
                    {connectedCount > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="secondary"
                            className="text-xs bg-green-100 text-green-800"
                          >
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
                  </>
                )}
              </div>
            </div>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2">
          {/* 渲染工具調用 */}
          {hasToolCalls &&
            toolCalls.map((toolCall, index) => (
              <ToolCallItem key={index} toolCall={toolCall} index={index} />
            ))}

          {/* 渲染服務器狀態 */}
          {showServerStatus &&
            servers.map((server) => <ServerItem key={server.id} server={server} />)}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default UnifiedMcpStatus;
