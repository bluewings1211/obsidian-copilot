import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { McpToolAdapterManager } from "@/mcp/tool-adapter";
import { getSettings } from "@/settings/model";
import {
  ChevronDown,
  ChevronRight,
  Server,
  Wifi,
  WifiOff,
  Settings,
  Zap,
  AlertCircle,
} from "lucide-react";
import React, { useEffect, useState } from "react";

interface McpServerInfo {
  id: string;
  name: string;
  status: "connected" | "disconnected" | "error";
  toolCount: number;
  lastError?: string;
}

interface McpServerStatusProps {
  className?: string;
}

/**
 * 顯示 MCP 服務器狀態的組件
 */
export const McpServerStatus: React.FC<McpServerStatusProps> = ({ className }) => {
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);

  // 更新服務器狀態
  const updateServerStatus = async () => {
    try {
      const settings = getSettings();
      setIsEnabled(settings.mcpIntegration.enabled);

      if (!settings.mcpIntegration.enabled || !McpToolAdapterManager.isInitialized()) {
        setServers([]);
        return;
      }

      const adapter = McpToolAdapterManager.getInstance();
      const tools = await adapter.getTools();

      // 按服務器分組工具
      const serverMap = new Map<string, McpServerInfo>();

      for (const tool of tools) {
        if (!serverMap.has(tool.serverId)) {
          serverMap.set(tool.serverId, {
            id: tool.serverId,
            name: tool.serverName,
            status: "connected",
            toolCount: 0,
          });
        }

        const server = serverMap.get(tool.serverId)!;
        server.toolCount += 1;
      }

      setServers(Array.from(serverMap.values()));
    } catch (error) {
      console.error("Failed to update MCP server status:", error);
      setServers([]);
    }
  };

  useEffect(() => {
    updateServerStatus();

    // 定期更新狀態
    const interval = setInterval(updateServerStatus, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: McpServerInfo["status"]) => {
    switch (status) {
      case "connected":
        return <Wifi className="w-3 h-3 text-green-500" />;
      case "disconnected":
        return <WifiOff className="w-3 h-3 text-yellow-500" />;
      case "error":
        return <AlertCircle className="w-3 h-3 text-red-500" />;
    }
  };

  const getStatusBadge = (status: McpServerInfo["status"]) => {
    const baseClasses = "text-xs";
    switch (status) {
      case "connected":
        return (
          <Badge variant="secondary" className={cn(baseClasses, "bg-green-100 text-green-800")}>
            已連接
          </Badge>
        );
      case "disconnected":
        return (
          <Badge variant="secondary" className={cn(baseClasses, "bg-yellow-100 text-yellow-800")}>
            已斷線
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

  if (!isEnabled) {
    return null;
  }

  const connectedCount = servers.filter((s) => s.status === "connected").length;
  const totalToolCount = servers.reduce((sum, s) => sum + s.toolCount, 0);

  return (
    <div className={cn("border border-border rounded-md p-2 bg-background/50", className)}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-start p-1 h-auto">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <Server className="w-4 h-4" />
                <span className="text-sm font-medium">MCP 服務器</span>
              </div>
              <div className="flex items-center gap-1">
                {servers.length > 0 && (
                  <>
                    <Badge variant="secondary" className="text-xs">
                      {connectedCount}/{servers.length}
                    </Badge>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="secondary" className="text-xs">
                          <Zap className="w-3 h-3 mr-1" />
                          {totalToolCount}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>總共 {totalToolCount} 個工具</TooltipContent>
                    </Tooltip>
                  </>
                )}
              </div>
            </div>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-1 pt-2">
          {servers.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-2">
              沒有已配置的 MCP 服務器
            </div>
          ) : (
            servers.map((server) => (
              <div
                key={server.id}
                className="flex items-center justify-between p-2 rounded border border-border/50"
              >
                <div className="flex items-center gap-2">
                  {getStatusIcon(server.status)}
                  <span className="text-sm font-medium">{server.name}</span>
                  {server.toolCount > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="text-xs">
                          <Settings className="w-3 h-3 mr-1" />
                          {server.toolCount}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>{server.toolCount} 個工具</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <div className="flex items-center gap-1">{getStatusBadge(server.status)}</div>
              </div>
            ))
          )}
          <div className="text-xs text-muted-foreground text-center pt-1">狀態會自動更新</div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default McpServerStatus;
