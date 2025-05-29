import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SettingItem } from "@/components/ui/setting-item";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  McpServerConfig,
  StdioTransportConfig,
  SseTransportConfig,
  HttpTransportConfig,
} from "@/mcp/types";
import { Plus, X, AlertCircle } from "lucide-react";

interface McpServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server?: McpServerConfig | null;
  onSave: (server: Omit<McpServerConfig, "id">) => void;
  title: string;
}

export const McpServerDialog: React.FC<McpServerDialogProps> = ({
  open,
  onOpenChange,
  server,
  onSave,
  title,
}) => {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    enabled: true,
    transport: "stdio" as "stdio" | "sse" | "http",
    connection: {} as StdioTransportConfig | SseTransportConfig | HttpTransportConfig,
    capabilities: [] as string[],
    timeout: 10000,
    retryAttempts: 3,
    retryDelay: 1000,
  });

  const [newCapability, setNewCapability] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form data when server prop changes
  useEffect(() => {
    if (server) {
      setFormData({
        name: server.name,
        description: server.description || "",
        enabled: server.enabled,
        transport: server.transport,
        connection: server.connection,
        capabilities: server.capabilities || [],
        timeout: server.timeout || 10000,
        retryAttempts: server.retryAttempts || 3,
        retryDelay: server.retryDelay || 1000,
      });
    } else {
      setFormData({
        name: "",
        description: "",
        enabled: true,
        transport: "stdio",
        connection: { command: "", args: [], env: {}, cwd: "" } as StdioTransportConfig,
        capabilities: [],
        timeout: 10000,
        retryAttempts: 3,
        retryDelay: 1000,
      });
    }
    setErrors({});
  }, [server, open]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "伺服器名稱為必填項目";
    }

    switch (formData.transport) {
      case "stdio": {
        const stdioConfig = formData.connection as StdioTransportConfig;
        if (!stdioConfig.command?.trim()) {
          newErrors.command = "指令為必填項目";
        }
        break;
      }
      case "sse": {
        const sseConfig = formData.connection as SseTransportConfig;
        if (!sseConfig.url?.trim()) {
          newErrors.url = "URL 為必填項目";
        } else if (!isValidUrl(sseConfig.url)) {
          newErrors.url = "請輸入有效的 URL";
        }
        break;
      }
      case "http": {
        const httpConfig = formData.connection as HttpTransportConfig;
        if (!httpConfig.url?.trim()) {
          newErrors.url = "URL 為必填項目";
        } else if (!isValidUrl(httpConfig.url)) {
          newErrors.url = "請輸入有效的 URL";
        }
        break;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const isValidUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const handleSave = () => {
    if (validateForm()) {
      onSave(formData);
      onOpenChange(false);
    }
  };

  const handleTransportChange = (transport: string) => {
    const newTransport = transport as "stdio" | "sse" | "http";
    let newConnection: StdioTransportConfig | SseTransportConfig | HttpTransportConfig;

    switch (newTransport) {
      case "stdio":
        newConnection = { command: "", args: [], env: {}, cwd: "" };
        break;
      case "sse":
        newConnection = { url: "", headers: {} };
        break;
      case "http":
        newConnection = { url: "", headers: {}, timeout: 30000 };
        break;
    }

    setFormData({
      ...formData,
      transport: newTransport,
      connection: newConnection,
    });
  };

  const handleConnectionUpdate = (field: string, value: string | number) => {
    setFormData({
      ...formData,
      connection: {
        ...formData.connection,
        [field]: value,
      },
    });
  };

  const handleArgsUpdate = (args: string[]) => {
    const stdioConfig = formData.connection as StdioTransportConfig;
    setFormData({
      ...formData,
      connection: {
        ...stdioConfig,
        args,
      },
    });
  };

  const addCapability = () => {
    if (newCapability.trim() && !formData.capabilities.includes(newCapability.trim())) {
      setFormData({
        ...formData,
        capabilities: [...formData.capabilities, newCapability.trim()],
      });
      setNewCapability("");
    }
  };

  const removeCapability = (capability: string) => {
    setFormData({
      ...formData,
      capabilities: formData.capabilities.filter((c) => c !== capability),
    });
  };

  const renderConnectionConfig = () => {
    switch (formData.transport) {
      case "stdio": {
        const stdioConfig = formData.connection as StdioTransportConfig;
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="command">指令 *</Label>
              <Input
                id="command"
                value={stdioConfig.command || ""}
                onChange={(e) => handleConnectionUpdate("command", e.target.value)}
                placeholder="例如: python, node, /path/to/executable"
                className={errors.command ? "border-destructive" : ""}
              />
              {errors.command && <p className="text-sm text-destructive mt-1">{errors.command}</p>}
            </div>

            <div>
              <Label htmlFor="args">參數</Label>
              <div className="space-y-2">
                {(stdioConfig.args || []).map((arg, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={arg}
                      onChange={(e) => {
                        const newArgs = [...(stdioConfig.args || [])];
                        newArgs[index] = e.target.value;
                        handleArgsUpdate(newArgs);
                      }}
                      placeholder={`參數 ${index + 1}`}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const newArgs = (stdioConfig.args || []).filter((_, i) => i !== index);
                        handleArgsUpdate(newArgs);
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleArgsUpdate([...(stdioConfig.args || []), ""])}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  新增參數
                </Button>
              </div>
            </div>

            <div>
              <Label htmlFor="cwd">工作目錄</Label>
              <Input
                id="cwd"
                value={stdioConfig.cwd || ""}
                onChange={(e) => handleConnectionUpdate("cwd", e.target.value)}
                placeholder="例如: /path/to/working/directory"
              />
            </div>
          </div>
        );
      }

      case "sse":
      case "http": {
        const config = formData.connection as SseTransportConfig | HttpTransportConfig;
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="url">URL *</Label>
              <Input
                id="url"
                value={config.url || ""}
                onChange={(e) => handleConnectionUpdate("url", e.target.value)}
                placeholder="例如: https://example.com/mcp 或 http://localhost:3000"
                className={errors.url ? "border-destructive" : ""}
              />
              {errors.url && <p className="text-sm text-destructive mt-1">{errors.url}</p>}
            </div>

            {formData.transport === "http" && (
              <div>
                <Label htmlFor="httpTimeout">HTTP 超時時間 (毫秒)</Label>
                <Input
                  id="httpTimeout"
                  type="number"
                  value={(config as HttpTransportConfig).timeout || 30000}
                  onChange={(e) =>
                    handleConnectionUpdate("timeout", parseInt(e.target.value) || 30000)
                  }
                  min={1000}
                  max={120000}
                />
              </div>
            )}
          </div>
        );
      }

      default:
        return null;
    }
  };

  const transportOptions = [
    { label: "Stdio (標準輸入輸出)", value: "stdio" },
    { label: "SSE (伺服器發送事件)", value: "sse" },
    { label: "HTTP", value: "http" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>設定 MCP 伺服器連接參數和功能選項</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">伺服器名稱 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="例如: Weather API Server"
                className={errors.name ? "border-destructive" : ""}
              />
              {errors.name && <p className="text-sm text-destructive mt-1">{errors.name}</p>}
            </div>

            <div>
              <Label htmlFor="description">描述</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="描述此伺服器的功能和用途"
                rows={3}
              />
            </div>

            <SettingItem
              type="switch"
              title="啟用伺服器"
              description="是否在啟動時自動連接此伺服器"
              checked={formData.enabled}
              onCheckedChange={(enabled) => setFormData({ ...formData, enabled })}
            />
          </div>

          {/* Transport Configuration */}
          <div className="space-y-4">
            <div>
              <Label>傳輸類型</Label>
              <SettingItem
                type="select"
                title=""
                value={formData.transport}
                onChange={(value) => handleTransportChange(value)}
                options={transportOptions}
              />
            </div>

            <Card className="p-4">
              <h4 className="font-medium mb-3">連接設定</h4>
              {renderConnectionConfig()}
            </Card>
          </div>

          {/* Capabilities */}
          <div className="space-y-4">
            <div>
              <Label>功能需求</Label>
              <p className="text-sm text-muted mb-2">指定此伺服器需要支援的功能 (選填)</p>

              <div className="flex gap-2 mb-3">
                <Input
                  value={newCapability}
                  onChange={(e) => setNewCapability(e.target.value)}
                  placeholder="例如: tools, resources, prompts"
                  onKeyPress={(e) => e.key === "Enter" && addCapability()}
                />
                <Button variant="secondary" onClick={addCapability}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {formData.capabilities.map((capability) => (
                  <Badge key={capability} variant="secondary" className="pr-1">
                    {capability}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-1 ml-1 hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => removeCapability(capability)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Advanced Settings */}
          <Card className="p-4">
            <h4 className="font-medium mb-3">進階設定</h4>
            <div className="space-y-4">
              <SettingItem
                type="slider"
                title="連接超時時間 (毫秒)"
                description="等待伺服器響應的最大時間"
                value={formData.timeout}
                onChange={(value) => setFormData({ ...formData, timeout: value })}
                min={1000}
                max={60000}
                step={1000}
              />

              <SettingItem
                type="slider"
                title="重試次數"
                description="連接失敗時的重試次數"
                value={formData.retryAttempts}
                onChange={(value) => setFormData({ ...formData, retryAttempts: value })}
                min={0}
                max={10}
                step={1}
              />

              <SettingItem
                type="slider"
                title="重試延遲 (毫秒)"
                description="重試之間的等待時間"
                value={formData.retryDelay}
                onChange={(value) => setFormData({ ...formData, retryDelay: value })}
                min={100}
                max={10000}
                step={100}
              />
            </div>
          </Card>

          {/* Warning for disabled MCP */}
          {!formData.enabled && (
            <Card className="p-4 border-orange-200 bg-orange-50">
              <div className="flex items-center gap-2 text-orange-700">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">此伺服器已停用，不會在啟動時自動連接</span>
              </div>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>儲存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
