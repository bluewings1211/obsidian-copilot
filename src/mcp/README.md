# Model Context Protocol (MCP) Integration

This directory contains the complete TypeScript interface definitions and utilities for integrating the Model Context Protocol into Obsidian Copilot.

## Overview

The Model Context Protocol (MCP) is an open standard that enables AI applications to securely connect to external data sources and tools. This integration allows Obsidian Copilot to interact with MCP servers, expanding its capabilities beyond built-in tools.

## Files Structure

### Core Files

- **`types.ts`** - Complete TypeScript interface definitions for all MCP concepts
- **`constants.ts`** - Protocol constants, method names, and default values
- **`utils.ts`** - Utility functions for validation, URI handling, and message creation
- **`schemas.ts`** - JSON Schema definitions for protocol validation
- **`client.ts`** - MCP client implementation with transport support
- **`transports/`** - Transport layer implementations (stdio, SSE)
- **`index.ts`** - Main export file for the MCP module

## Type Definitions Coverage

### ✅ JSON-RPC 2.0 Protocol

- Base message types (Request, Response, Notification)
- Error handling structures
- ID and version management

### ✅ MCP Core Protocol

- Protocol initialization and handshake
- Client and server information
- Capability negotiation
- Version compatibility

### ✅ Resources

- Resource definitions and templates
- Content reading and listing
- Subscription management
- URI-based resource identification

### ✅ Tools

- Tool definitions with JSON Schema
- Parameter validation
- Execution results and error handling
- Content types (text, image, embedded resources)

### ✅ Prompts

- Prompt templates with arguments
- Message composition
- Role-based content (user, assistant, system)
- Multi-modal content support

### ✅ Sampling (AI Model Interaction)

- Model preferences and hints
- Priority-based selection
- Context inclusion options
- Token limits and stop sequences

### ✅ Transport Layer

- Abstract transport interface
- STDIO, SSE, and HTTP configurations
- Connection state management
- Error and event handling

### ✅ MCP Client Implementation

- Full MCP protocol client with stdio and SSE transport support
- Connection management with automatic retry
- Event-driven architecture
- Type-safe method calls for all MCP operations

### ✅ Obsidian Integration

- Server configuration management
- Integration settings
- Context-aware tool execution
- Vault and file-specific operations

## Key Features

### Type Safety

- Complete TypeScript coverage for all MCP concepts
- Strict type checking and validation
- Generic interfaces for extensibility

### Validation

- JSON Schema definitions for all protocol messages
- Runtime validation utilities
- Input sanitization and safety checks

### Error Handling

- Comprehensive error type definitions
- JSON-RPC error codes and MCP-specific errors
- Safe error propagation and reporting

### Utility Functions

- Message creation helpers
- URI parsing and validation
- Content type detection
- Performance utilities (debounce, throttle, timeout)

## Usage Examples

### Basic Type Usage

```typescript
import { Tool, Resource, McpServerConfig, createRequest, validateTool } from "../mcp";

// Define a tool
const myTool: Tool = {
  name: "search_notes",
  description: "Search through Obsidian notes",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      limit: { type: "number" },
    },
    required: ["query"],
  },
};

// Validate the tool
if (validateTool(myTool)) {
  console.log("Tool is valid");
}

// Create a JSON-RPC request
const request = createRequest("1", "tools/call", {
  name: "search_notes",
  arguments: { query: "TypeScript", limit: 10 },
});
```

### Server Configuration

```typescript
import { McpServerConfig, validateServerConfig } from "../mcp";

const serverConfig: McpServerConfig = {
  id: "file-server",
  name: "File System Server",
  description: "Access to local file system",
  enabled: true,
  transport: "stdio",
  connection: {
    command: "node",
    args: ["./servers/file-server.js"],
  },
  capabilities: ["resources", "tools"],
  timeout: 10000,
  retryAttempts: 3,
};

if (validateServerConfig(serverConfig)) {
  // Configuration is valid
}
```

### MCP Client Usage

```typescript
import { McpClient, McpServerConfig } from "../mcp";

// Configure MCP server
const config: McpServerConfig = {
  id: "filesystem-server",
  name: "File System Server",
  enabled: true,
  transport: "stdio",
  connection: {
    command: "node",
    args: ["./mcp-servers/filesystem.js"],
  },
};

// Create and connect client
const client = new McpClient(config, {
  debug: true,
  requestTimeout: 30000,
});

client.on("connected", (serverInfo) => {
  console.log("Connected to:", serverInfo.serverInfo.name);
});

client.on("error", (error) => {
  console.error("Client error:", error);
});

try {
  await client.connect();

  // Use MCP server tools
  const tools = await client.listTools();
  console.log("Available tools:", tools.tools);

  const result = await client.callTool({
    name: "read_file",
    arguments: { path: "/path/to/file.txt" },
  });
  console.log("Tool result:", result);
} finally {
  await client.disconnect();
}
```

## Protocol Compliance

This implementation follows the official MCP specification:

- **Protocol Versions**: 2024-11-05, 2025-03-26
- **Transport Types**: STDIO, SSE (Server-Sent Events), HTTP
- **Content Types**: Text, Images, Binary data (base64)
- **JSON-RPC 2.0**: Full compliance with request/response/notification patterns

## Integration Points

### Obsidian Copilot Integration

- Extends existing tool system
- Integrates with chat interface
- Supports vault-aware operations
- Maintains user context and preferences

### Future Extensibility

- Plugin-based server discovery
- Custom transport implementations
- Advanced capability negotiation
- Performance monitoring and analytics

## Development Notes

### Code Quality

- ESLint and Prettier compliant
- Comprehensive JSDoc documentation
- Type-safe error handling
- Performance-optimized utilities

### Testing Ready

- Modular design for unit testing
- Mock-friendly interfaces
- Validation functions for test data
- Error scenario coverage

## Completed Tasks

This module includes the following completed implementations:

- ✅ **Task 2**: MCP 核心介面定義 - Complete TypeScript interface definitions
- ✅ **Task 3**: MCPClient 實作 - Full MCP client with stdio and SSE transport support

## Next Steps

The next tasks will build upon these implementations:

1. **Task 4**: MCPManager for server lifecycle management
2. **Task 5**: MCPToolAdapter for integration with existing tools
3. **Task 6**: Configuration UI using McpServerConfig types

## Related Documentation

- [Official MCP Specification](https://spec.modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
