/**
 * Model Context Protocol (MCP) Schema Definitions
 *
 * This file contains JSON schema definitions and validation schemas
 * for MCP protocol messages and data structures.
 */

import type { JsonSchema } from "./types";

// ==============================================================================
// Base Schemas
// ==============================================================================

/**
 * JSON-RPC 2.0 base message schema
 */
export const JSON_RPC_MESSAGE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    jsonrpc: {
      type: "string",
      enum: ["2.0"],
    },
  },
  required: ["jsonrpc"],
  additionalProperties: true,
};

/**
 * JSON-RPC 2.0 request schema
 */
export const JSON_RPC_REQUEST_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    ...JSON_RPC_MESSAGE_SCHEMA.properties,
    id: {
      type: "string",
    },
    method: {
      type: "string",
    },
    params: {
      type: "object",
    },
  },
  required: ["jsonrpc", "id", "method"],
  additionalProperties: false,
};

/**
 * JSON-RPC 2.0 response schema
 */
export const JSON_RPC_RESPONSE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    ...JSON_RPC_MESSAGE_SCHEMA.properties,
    id: {
      type: "string",
    },
    result: {
      type: "object",
    },
    error: {
      type: "object",
      properties: {
        code: { type: "number" },
        message: { type: "string" },
        data: {
          type: "object",
        },
      },
      required: ["code", "message"],
      additionalProperties: false,
    },
  },
  required: ["jsonrpc", "id"],
  oneOf: [{ required: ["result"] }, { required: ["error"] }],
  additionalProperties: false,
};

/**
 * JSON-RPC 2.0 notification schema
 */
export const JSON_RPC_NOTIFICATION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    ...JSON_RPC_MESSAGE_SCHEMA.properties,
    method: {
      type: "string",
    },
    params: {
      type: "object",
    },
  },
  required: ["jsonrpc", "method"],
  additionalProperties: false,
};

// ==============================================================================
// MCP Protocol Schemas
// ==============================================================================

/**
 * Client info schema
 */
export const CLIENT_INFO_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    version: { type: "string" },
  },
  required: ["name", "version"],
  additionalProperties: false,
};

/**
 * Server info schema
 */
export const SERVER_INFO_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    version: { type: "string" },
  },
  required: ["name", "version"],
  additionalProperties: false,
};

/**
 * Initialize request parameters schema
 */
export const INITIALIZE_PARAMS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    protocolVersion: {
      type: "string",
      enum: ["2024-11-05", "2025-03-26"],
    },
    clientInfo: CLIENT_INFO_SCHEMA,
    capabilities: {
      type: "object",
      properties: {
        experimental: { type: "object" },
        sampling: { type: "object" },
        roots: {
          type: "object",
          properties: {
            listChanged: { type: "boolean" },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
  },
  required: ["protocolVersion", "clientInfo", "capabilities"],
  additionalProperties: false,
};

/**
 * Initialize response schema
 */
export const INITIALIZE_RESULT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    protocolVersion: {
      type: "string",
      enum: ["2024-11-05", "2025-03-26"],
    },
    serverInfo: SERVER_INFO_SCHEMA,
    capabilities: {
      type: "object",
      properties: {
        experimental: { type: "object" },
        logging: { type: "object" },
        prompts: {
          type: "object",
          properties: {
            listChanged: { type: "boolean" },
          },
          additionalProperties: false,
        },
        resources: {
          type: "object",
          properties: {
            subscribe: { type: "boolean" },
            listChanged: { type: "boolean" },
          },
          additionalProperties: false,
        },
        tools: {
          type: "object",
          properties: {
            listChanged: { type: "boolean" },
          },
          additionalProperties: false,
        },
        sampling: { type: "object" },
      },
      additionalProperties: false,
    },
  },
  required: ["protocolVersion", "serverInfo", "capabilities"],
  additionalProperties: false,
};

// ==============================================================================
// Resource Schemas
// ==============================================================================

/**
 * Resource schema
 */
export const RESOURCE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    uri: { type: "string" },
    name: { type: "string" },
    description: { type: "string" },
    mimeType: { type: "string" },
  },
  required: ["uri", "name"],
  additionalProperties: false,
};

/**
 * Resource template schema
 */
export const RESOURCE_TEMPLATE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    uriTemplate: { type: "string" },
    name: { type: "string" },
    description: { type: "string" },
    mimeType: { type: "string" },
  },
  required: ["uriTemplate", "name"],
  additionalProperties: false,
};

/**
 * Resource content schema
 */
export const RESOURCE_CONTENT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    uri: { type: "string" },
    mimeType: { type: "string" },
    text: { type: "string" },
    blob: { type: "string" },
  },
  required: ["uri"],
  oneOf: [{ required: ["text"] }, { required: ["blob"] }],
  additionalProperties: false,
};

/**
 * List resources parameters schema
 */
export const LIST_RESOURCES_PARAMS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    cursor: { type: "string" },
  },
  additionalProperties: false,
};

/**
 * List resources result schema
 */
export const LIST_RESOURCES_RESULT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    resources: {
      type: "array",
      items: RESOURCE_SCHEMA,
    },
    nextCursor: { type: "string" },
  },
  required: ["resources"],
  additionalProperties: false,
};

/**
 * Read resource parameters schema
 */
export const READ_RESOURCE_PARAMS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    uri: { type: "string" },
  },
  required: ["uri"],
  additionalProperties: false,
};

/**
 * Read resource result schema
 */
export const READ_RESOURCE_RESULT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    contents: {
      type: "array",
      items: RESOURCE_CONTENT_SCHEMA,
    },
  },
  required: ["contents"],
  additionalProperties: false,
};

// ==============================================================================
// Tool Schemas
// ==============================================================================

/**
 * Tool schema
 */
export const TOOL_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string" },
        properties: { type: "object" },
        required: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["type"],
      additionalProperties: true,
    },
  },
  required: ["name", "inputSchema"],
  additionalProperties: false,
};

/**
 * List tools parameters schema
 */
export const LIST_TOOLS_PARAMS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    cursor: { type: "string" },
  },
  additionalProperties: false,
};

/**
 * List tools result schema
 */
export const LIST_TOOLS_RESULT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    tools: {
      type: "array",
      items: TOOL_SCHEMA,
    },
    nextCursor: { type: "string" },
  },
  required: ["tools"],
  additionalProperties: false,
};

/**
 * Call tool parameters schema
 */
export const CALL_TOOL_PARAMS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    arguments: { type: "object" },
  },
  required: ["name"],
  additionalProperties: false,
};

/**
 * Tool content schema
 */
export const TOOL_CONTENT_SCHEMA: JsonSchema = {
  type: "object",
  oneOf: [
    {
      type: "object",
      properties: {
        type: { type: "string", enum: ["text"] },
        text: { type: "string" },
      },
      required: ["type", "text"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { type: "string", enum: ["image"] },
        data: { type: "string" },
        mimeType: { type: "string" },
      },
      required: ["type", "data", "mimeType"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { type: "string", enum: ["resource"] },
        resource: RESOURCE_CONTENT_SCHEMA,
      },
      required: ["type", "resource"],
      additionalProperties: false,
    },
  ],
};

/**
 * Call tool result schema
 */
export const CALL_TOOL_RESULT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    content: {
      type: "array",
      items: TOOL_CONTENT_SCHEMA,
    },
    isError: { type: "boolean" },
  },
  required: ["content"],
  additionalProperties: false,
};

// ==============================================================================
// Prompt Schemas
// ==============================================================================

/**
 * Prompt argument schema
 */
export const PROMPT_ARGUMENT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    required: { type: "boolean" },
  },
  required: ["name"],
  additionalProperties: false,
};

/**
 * Prompt schema
 */
export const PROMPT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    arguments: {
      type: "array",
      items: PROMPT_ARGUMENT_SCHEMA,
    },
  },
  required: ["name"],
  additionalProperties: false,
};

/**
 * List prompts parameters schema
 */
export const LIST_PROMPTS_PARAMS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    cursor: { type: "string" },
  },
  additionalProperties: false,
};

/**
 * List prompts result schema
 */
export const LIST_PROMPTS_RESULT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    prompts: {
      type: "array",
      items: PROMPT_SCHEMA,
    },
    nextCursor: { type: "string" },
  },
  required: ["prompts"],
  additionalProperties: false,
};

/**
 * Get prompt parameters schema
 */
export const GET_PROMPT_PARAMS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    arguments: {
      type: "object",
      additionalProperties: { type: "string" },
    },
  },
  required: ["name"],
  additionalProperties: false,
};

/**
 * Message content schema
 */
export const MESSAGE_CONTENT_SCHEMA: JsonSchema = {
  type: "object",
  oneOf: [
    {
      type: "object",
      properties: {
        type: { type: "string", enum: ["text"] },
        text: { type: "string" },
      },
      required: ["type", "text"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { type: "string", enum: ["image"] },
        data: { type: "string" },
        mimeType: { type: "string" },
      },
      required: ["type", "data", "mimeType"],
      additionalProperties: false,
    },
  ],
};

/**
 * Prompt message schema
 */
export const PROMPT_MESSAGE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    role: {
      type: "string",
      enum: ["user", "assistant", "system"],
    },
    content: MESSAGE_CONTENT_SCHEMA,
  },
  required: ["role", "content"],
  additionalProperties: false,
};

/**
 * Get prompt result schema
 */
export const GET_PROMPT_RESULT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    description: { type: "string" },
    messages: {
      type: "array",
      items: PROMPT_MESSAGE_SCHEMA,
    },
  },
  required: ["messages"],
  additionalProperties: false,
};

// ==============================================================================
// Sampling Schemas
// ==============================================================================

/**
 * Model hint schema
 */
export const MODEL_HINT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
  },
  additionalProperties: false,
};

/**
 * Model preferences schema
 */
export const MODEL_PREFERENCES_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    hints: {
      type: "array",
      items: MODEL_HINT_SCHEMA,
    },
    costPriority: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
    speedPriority: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
    intelligencePriority: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
  },
  additionalProperties: false,
};

/**
 * Sampling message schema
 */
export const SAMPLING_MESSAGE_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    role: {
      type: "string",
      enum: ["user", "assistant"],
    },
    content: MESSAGE_CONTENT_SCHEMA,
  },
  required: ["role", "content"],
  additionalProperties: false,
};

/**
 * Create message parameters schema
 */
export const CREATE_MESSAGE_PARAMS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    messages: {
      type: "array",
      items: SAMPLING_MESSAGE_SCHEMA,
    },
    modelPreferences: MODEL_PREFERENCES_SCHEMA,
    systemPrompt: { type: "string" },
    includeContext: {
      type: "string",
      enum: ["none", "thisServer", "allServers"],
    },
    temperature: {
      type: "number",
      minimum: 0,
      maximum: 2,
    },
    maxTokens: {
      type: "number",
      minimum: 1,
    },
    stopSequences: {
      type: "array",
      items: { type: "string" },
    },
    metadata: { type: "object" },
  },
  required: ["messages", "maxTokens"],
  additionalProperties: false,
};

/**
 * Create message result schema
 */
export const CREATE_MESSAGE_RESULT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    role: {
      type: "string",
      enum: ["assistant"],
    },
    content: MESSAGE_CONTENT_SCHEMA,
    model: { type: "string" },
    stopReason: {
      type: "string",
      enum: ["endTurn", "stopSequence", "maxTokens"],
    },
  },
  required: ["role", "content", "model"],
  additionalProperties: false,
};

// ==============================================================================
// Logging Schemas
// ==============================================================================

/**
 * Logging message parameters schema
 */
export const LOGGING_MESSAGE_PARAMS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    level: {
      type: "string",
      enum: ["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"],
    },
    data: {
      type: "object",
    },
    logger: { type: "string" },
  },
  required: ["level"],
  additionalProperties: false,
};

// ==============================================================================
// Roots Schemas
// ==============================================================================

/**
 * Root schema
 */
export const ROOT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    uri: { type: "string" },
    name: { type: "string" },
  },
  required: ["uri", "name"],
  additionalProperties: false,
};

/**
 * List roots result schema
 */
export const LIST_ROOTS_RESULT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    roots: {
      type: "array",
      items: ROOT_SCHEMA,
    },
  },
  required: ["roots"],
  additionalProperties: false,
};

// ==============================================================================
// Request Schema Mapping
// ==============================================================================

/**
 * Mapping of MCP methods to their request parameter schemas
 */
export const REQUEST_SCHEMAS: Record<string, JsonSchema> = {
  initialize: INITIALIZE_PARAMS_SCHEMA,
  "resources/list": LIST_RESOURCES_PARAMS_SCHEMA,
  "resources/read": READ_RESOURCE_PARAMS_SCHEMA,
  "tools/list": LIST_TOOLS_PARAMS_SCHEMA,
  "tools/call": CALL_TOOL_PARAMS_SCHEMA,
  "prompts/list": LIST_PROMPTS_PARAMS_SCHEMA,
  "prompts/get": GET_PROMPT_PARAMS_SCHEMA,
  "sampling/createMessage": CREATE_MESSAGE_PARAMS_SCHEMA,
  "logging/setLevel": LOGGING_MESSAGE_PARAMS_SCHEMA,
};

/**
 * Mapping of MCP methods to their response schemas
 */
export const RESPONSE_SCHEMAS: Record<string, JsonSchema> = {
  initialize: INITIALIZE_RESULT_SCHEMA,
  "resources/list": LIST_RESOURCES_RESULT_SCHEMA,
  "resources/read": READ_RESOURCE_RESULT_SCHEMA,
  "tools/list": LIST_TOOLS_RESULT_SCHEMA,
  "tools/call": CALL_TOOL_RESULT_SCHEMA,
  "prompts/list": LIST_PROMPTS_RESULT_SCHEMA,
  "prompts/get": GET_PROMPT_RESULT_SCHEMA,
  "sampling/createMessage": CREATE_MESSAGE_RESULT_SCHEMA,
  "roots/list": LIST_ROOTS_RESULT_SCHEMA,
};
