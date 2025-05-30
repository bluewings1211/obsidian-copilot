import React, { useState } from "react";
import { SettingItem } from "@/components/ui/setting-item";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  useSettingsValue,
  addMcpServer,
  updateMcpServer,
  removeMcpServer,
  toggleMcpIntegration,
  updateMcpGlobalSettings,
} from "@/settings/model";
import { McpServerConfig, LogLevel } from "@/mcp/types";
import { Plus, Settings, Trash2, Play, Square, AlertCircle } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { McpServerDialog } from "./McpServerDialog";
import { cn } from "@/lib/utils";

export const McpSettings: React.FC = () => {
  const settings = useSettingsValue();
  const [editingServer, setEditingServer] = useState<McpServerConfig | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const mcpSettings = settings.mcpIntegration;

  const handleAddServer = (serverConfig: Omit<McpServerConfig, "id">) => {
    // If MCP integration is not enabled, enable it automatically when adding first server
    if (!mcpSettings.enabled) {
      toggleMcpIntegration(true);
    }

    const newServer: McpServerConfig = {
      ...serverConfig,
      id: uuidv4(),
    };
    addMcpServer(newServer);
  };

  const handleUpdateServer = (originalServer: McpServerConfig, updatedServer: McpServerConfig) => {
    updateMcpServer(originalServer.id, updatedServer);
  };

  const handleDeleteServer = (serverId: string) => {
    removeMcpServer(serverId);
  };

  const handleToggleServer = (serverId: string, enabled: boolean) => {
    updateMcpServer(serverId, { enabled });
  };

  const logLevelOptions = [
    { label: "Debug", value: "debug" },
    { label: "Info", value: "info" },
    { label: "Notice", value: "notice" },
    { label: "Warning", value: "warning" },
    { label: "Error", value: "error" },
    { label: "Critical", value: "critical" },
    { label: "Alert", value: "alert" },
    { label: "Emergency", value: "emergency" },
  ];

  const getTransportBadgeColor = (transport: string) => {
    switch (transport) {
      case "stdio":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "sse":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "http":
        return "bg-purple-500/10 text-purple-500 border-purple-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  const getConnectionInfo = (server: McpServerConfig) => {
    switch (server.transport) {
      case "stdio": {
        const stdioConfig = server.connection as any;
        return `${stdioConfig.command} ${(stdioConfig.args || []).join(" ")}`.trim();
      }
      case "sse": {
        const sseConfig = server.connection as any;
        return sseConfig.url;
      }
      case "http": {
        const httpConfig = server.connection as any;
        return httpConfig.url;
      }
      default:
        return "Unknown connection";
    }
  };

  return (
    <div className="space-y-6">
      {/* MCP Integration Toggle */}
      <section>
        <div className="text-xl font-bold mb-3">MCP 整合</div>
        <SettingItem
          type="switch"
          title="啟用 MCP 整合"
          description="啟用 Model Context Protocol 整合，允許連接和使用外部 MCP 伺服器"
          checked={mcpSettings.enabled}
          onCheckedChange={(enabled) => toggleMcpIntegration(enabled)}
        />
      </section>

      {/* Global Settings */}
      <section>
        <div className="text-xl font-bold mb-3">全域設定</div>
        <div className="space-y-4">
          <SettingItem
            type="slider"
            title="全域超時時間 (毫秒)"
            description="MCP 操作的預設超時時間"
            value={mcpSettings.globalTimeout}
            onChange={(value) => updateMcpGlobalSettings({ globalTimeout: value })}
            min={1000}
            max={30000}
            step={1000}
          />

          <SettingItem
            type="slider"
            title="最大並發連接數"
            description="同時連接的 MCP 伺服器最大數量"
            value={mcpSettings.maxConcurrentConnections}
            onChange={(value) => updateMcpGlobalSettings({ maxConcurrentConnections: value })}
            min={1}
            max={10}
            step={1}
          />

          <SettingItem
            type="switch"
            title="除錯模式"
            description="啟用 MCP 除錯日誌"
            checked={mcpSettings.debugMode}
            onCheckedChange={(debugMode) => updateMcpGlobalSettings({ debugMode })}
          />

          <SettingItem
            type="select"
            title="日誌級別"
            description="MCP 操作的日誌級別"
            value={mcpSettings.logLevel}
            onChange={(value) => updateMcpGlobalSettings({ logLevel: value as LogLevel })}
            options={logLevelOptions}
          />
        </div>
      </section>

      {/* MCP Servers */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xl font-bold">MCP 伺服器</div>
          <Button
            onClick={() => setShowAddDialog(true)}
            size="sm"
            className="flex items-center gap-2"
            disabled={!mcpSettings.enabled}
          >
            <Plus className="w-4 h-4" />
            新增伺服器
          </Button>
        </div>

        {mcpSettings.servers.length === 0 ? (
          <Card className="p-6 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted" />
            <h3 className="text-lg font-medium mb-2">沒有設定的 MCP 伺服器</h3>
            <p className="text-muted mb-4">開始添加 MCP 伺服器以擴展 Copilot 的功能</p>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              新增第一個伺服器
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {mcpSettings.servers.map((server) => (
              <Card key={server.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium text-lg">{server.name}</h3>
                      <Badge className={cn("text-xs", getTransportBadgeColor(server.transport))}>
                        {server.transport.toUpperCase()}
                      </Badge>
                      <Badge variant={server.enabled ? "default" : "secondary"}>
                        {server.enabled ? "已啟用" : "已停用"}
                      </Badge>
                    </div>

                    {server.description && (
                      <p className="text-sm text-muted">{server.description}</p>
                    )}

                    <div className="text-sm text-muted font-mono bg-muted/30 p-2 rounded">
                      {getConnectionInfo(server)}
                    </div>

                    {server.capabilities && server.capabilities.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {server.capabilities.map((capability) => (
                          <Badge key={capability} variant="outline" className="text-xs">
                            {capability}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleServer(server.id, !server.enabled)}
                      disabled={!mcpSettings.enabled}
                    >
                      {server.enabled ? (
                        <Square className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingServer(server)}>
                      <Settings className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteServer(server.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Add Server Dialog */}
      <McpServerDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSave={handleAddServer}
        title="新增 MCP 伺服器"
      />

      {/* Edit Server Dialog */}
      <McpServerDialog
        open={!!editingServer}
        onOpenChange={(open: boolean) => !open && setEditingServer(null)}
        server={editingServer}
        onSave={(serverConfig: Omit<McpServerConfig, "id">) => {
          if (editingServer) {
            handleUpdateServer(editingServer, { ...serverConfig, id: editingServer.id });
          }
        }}
        title="編輯 MCP 伺服器"
      />
    </div>
  );
};
