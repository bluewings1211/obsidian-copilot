/**
 * Tests for MCP settings functionality
 */

import { describe, expect, it, beforeEach } from "@jest/globals";
import {
  setSettings,
  getSettings,
  sanitizeSettings,
  addMcpServer,
  updateMcpServer,
  removeMcpServer,
  getMcpServer,
  getEnabledMcpServers,
  toggleMcpIntegration,
  updateMcpGlobalSettings,
} from "./model";
import { DEFAULT_SETTINGS } from "@/constants";
import { McpServerConfig } from "@/mcp/types";

describe("MCP Settings", () => {
  beforeEach(() => {
    // Reset settings to default before each test
    setSettings(DEFAULT_SETTINGS);
  });

  describe("Default MCP Settings", () => {
    it("should have default MCP integration settings", () => {
      const settings = getSettings();

      expect(settings.mcpIntegration).toBeDefined();
      expect(settings.mcpIntegration.enabled).toBe(false);
      expect(settings.mcpIntegration.servers).toEqual([]);
      expect(settings.mcpIntegration.globalTimeout).toBe(10000);
      expect(settings.mcpIntegration.maxConcurrentConnections).toBe(10);
      expect(settings.mcpIntegration.debugMode).toBe(false);
      expect(settings.mcpIntegration.logLevel).toBe("info");
    });
  });

  describe("MCP Settings Sanitization", () => {
    it("should sanitize invalid MCP settings", () => {
      const invalidSettings = {
        ...DEFAULT_SETTINGS,
        mcpIntegration: {
          enabled: "true" as any, // Invalid boolean
          servers: "invalid" as any, // Invalid array
          globalTimeout: "invalid" as any, // Invalid number
          maxConcurrentConnections: "invalid" as any, // Invalid number
          debugMode: "true" as any, // Invalid boolean
          logLevel: "invalid" as any, // Invalid log level
        },
      };

      const sanitized = sanitizeSettings(invalidSettings);

      expect(sanitized.mcpIntegration.enabled).toBe(false);
      expect(sanitized.mcpIntegration.servers).toEqual([]);
      expect(sanitized.mcpIntegration.globalTimeout).toBe(10000);
      expect(sanitized.mcpIntegration.maxConcurrentConnections).toBe(10);
      expect(sanitized.mcpIntegration.debugMode).toBe(false);
      expect(sanitized.mcpIntegration.logLevel).toBe("info");
    });

    it("should preserve valid MCP settings", () => {
      const validSettings = {
        ...DEFAULT_SETTINGS,
        mcpIntegration: {
          enabled: true,
          servers: [],
          globalTimeout: 20000,
          maxConcurrentConnections: 5,
          debugMode: true,
          logLevel: "debug" as const,
        },
      };

      const sanitized = sanitizeSettings(validSettings);

      expect(sanitized.mcpIntegration.enabled).toBe(true);
      expect(sanitized.mcpIntegration.servers).toEqual([]);
      expect(sanitized.mcpIntegration.globalTimeout).toBe(20000);
      expect(sanitized.mcpIntegration.maxConcurrentConnections).toBe(5);
      expect(sanitized.mcpIntegration.debugMode).toBe(true);
      expect(sanitized.mcpIntegration.logLevel).toBe("debug");
    });
  });

  describe("MCP Server Management", () => {
    const testServer: McpServerConfig = {
      id: "test-server",
      name: "Test Server",
      description: "A test MCP server",
      enabled: true,
      transport: "stdio",
      connection: {
        command: "node",
        args: ["test-server.js"],
      },
      timeout: 5000,
      retryAttempts: 2,
      retryDelay: 1000,
    };

    it("should add MCP server", () => {
      addMcpServer(testServer);

      const settings = getSettings();
      expect(settings.mcpIntegration.servers).toHaveLength(1);
      expect(settings.mcpIntegration.servers[0]).toEqual(testServer);
    });

    it("should update MCP server", () => {
      addMcpServer(testServer);

      const updates = { enabled: false, name: "Updated Test Server" };
      updateMcpServer("test-server", updates);

      const settings = getSettings();
      const updatedServer = settings.mcpIntegration.servers[0];
      expect(updatedServer.enabled).toBe(false);
      expect(updatedServer.name).toBe("Updated Test Server");
      expect(updatedServer.description).toBe(testServer.description); // Should preserve other fields
    });

    it("should remove MCP server", () => {
      addMcpServer(testServer);
      expect(getSettings().mcpIntegration.servers).toHaveLength(1);

      removeMcpServer("test-server");
      expect(getSettings().mcpIntegration.servers).toHaveLength(0);
    });

    it("should get MCP server by ID", () => {
      addMcpServer(testServer);

      const server = getMcpServer("test-server");
      expect(server).toEqual(testServer);

      const nonExistentServer = getMcpServer("non-existent");
      expect(nonExistentServer).toBeUndefined();
    });

    it("should get enabled MCP servers", () => {
      const enabledServer = { ...testServer, id: "enabled-server", enabled: true };
      const disabledServer = { ...testServer, id: "disabled-server", enabled: false };

      addMcpServer(enabledServer);
      addMcpServer(disabledServer);

      const enabledServers = getEnabledMcpServers();
      expect(enabledServers).toHaveLength(1);
      expect(enabledServers[0].id).toBe("enabled-server");
    });
  });

  describe("MCP Integration Management", () => {
    it("should toggle MCP integration", () => {
      expect(getSettings().mcpIntegration.enabled).toBe(false);

      toggleMcpIntegration(true);
      expect(getSettings().mcpIntegration.enabled).toBe(true);

      toggleMcpIntegration(false);
      expect(getSettings().mcpIntegration.enabled).toBe(false);
    });

    it("should update MCP global settings", () => {
      const updates = {
        globalTimeout: 15000,
        maxConcurrentConnections: 20,
        debugMode: true,
        logLevel: "debug" as const,
      };

      updateMcpGlobalSettings(updates);

      const settings = getSettings();
      expect(settings.mcpIntegration.globalTimeout).toBe(15000);
      expect(settings.mcpIntegration.maxConcurrentConnections).toBe(20);
      expect(settings.mcpIntegration.debugMode).toBe(true);
      expect(settings.mcpIntegration.logLevel).toBe("debug");
      expect(settings.mcpIntegration.enabled).toBe(false); // Should preserve other fields
    });
  });
});
