import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
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
  Zap,
} from "lucide-react";
import React, { useState } from "react";

interface McpToolDisplayProps {
  toolCalls: McpToolCall[];
  className?: string;
}

/**
 * 顯示單個 MCP 工具調用的組件
 */
const McpToolCallItem: React.FC<{ toolCall: McpToolCall }> = ({ toolCall }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

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

  return (
    <div className="border border-border rounded-md p-3 space-y-2 bg-background/50">
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
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-start p-0 h-auto">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 mr-1" />
            ) : (
              <ChevronRight className="w-4 h-4 mr-1" />
            )}
            <span className="text-xs text-muted-foreground">
              {isExpanded ? "隱藏詳細資訊" : "顯示詳細資訊"}
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
                onClick={() => copyToClipboard(formatArguments(toolCall.arguments), "args")}
              >
                <Copy className="w-3 h-3" />
                {copiedField === "args" && <span className="ml-1 text-xs">已複製</span>}
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
                  onClick={() => copyToClipboard(formatResult(toolCall.result), "result")}
                >
                  <Copy className="w-3 h-3" />
                  {copiedField === "result" && <span className="ml-1 text-xs">已複製</span>}
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

/**
 * 顯示 MCP 工具調用列表的主組件
 */
export const McpToolDisplay: React.FC<McpToolDisplayProps> = ({ toolCalls, className }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!toolCalls || toolCalls.length === 0) {
    return null;
  }

  const pendingCount = toolCalls.filter((call) => call.status === "pending").length;
  const successCount = toolCalls.filter((call) => call.status === "success").length;
  const errorCount = toolCalls.filter((call) => call.status === "error").length;

  return (
    <div className={cn("space-y-2", className)}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-start p-2 h-auto">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <Settings className="w-4 h-4" />
                <span className="text-sm font-medium">MCP 工具調用</span>
                <Badge variant="secondary" className="text-xs">
                  {toolCalls.length}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
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
              </div>
            </div>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2">
          {toolCalls.map((toolCall, index) => (
            <McpToolCallItem key={`${toolCall.toolName}-${index}`} toolCall={toolCall} />
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default McpToolDisplay;
