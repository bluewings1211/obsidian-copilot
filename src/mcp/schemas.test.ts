/**
 * MCP Schemas Unit Tests
 */

import {
  JSON_RPC_MESSAGE_SCHEMA,
  JSON_RPC_REQUEST_SCHEMA,
  JSON_RPC_RESPONSE_SCHEMA,
  JSON_RPC_NOTIFICATION_SCHEMA,
  CLIENT_INFO_SCHEMA,
  SERVER_INFO_SCHEMA,
  INITIALIZE_PARAMS_SCHEMA,
  INITIALIZE_RESULT_SCHEMA,
  RESOURCE_SCHEMA,
  RESOURCE_TEMPLATE_SCHEMA,
  RESOURCE_CONTENT_SCHEMA,
  LIST_RESOURCES_PARAMS_SCHEMA,
  LIST_RESOURCES_RESULT_SCHEMA,
  READ_RESOURCE_PARAMS_SCHEMA,
  READ_RESOURCE_RESULT_SCHEMA,
  TOOL_SCHEMA,
  LIST_TOOLS_PARAMS_SCHEMA,
  LIST_TOOLS_RESULT_SCHEMA,
  CALL_TOOL_PARAMS_SCHEMA,
  TOOL_CONTENT_SCHEMA,
  CALL_TOOL_RESULT_SCHEMA,
  PROMPT_ARGUMENT_SCHEMA,
  PROMPT_SCHEMA,
  LIST_PROMPTS_PARAMS_SCHEMA,
  LIST_PROMPTS_RESULT_SCHEMA,
  GET_PROMPT_PARAMS_SCHEMA,
  MESSAGE_CONTENT_SCHEMA,
  PROMPT_MESSAGE_SCHEMA,
  GET_PROMPT_RESULT_SCHEMA,
  MODEL_HINT_SCHEMA,
  MODEL_PREFERENCES_SCHEMA,
  SAMPLING_MESSAGE_SCHEMA,
  CREATE_MESSAGE_PARAMS_SCHEMA,
  CREATE_MESSAGE_RESULT_SCHEMA,
  LOGGING_MESSAGE_PARAMS_SCHEMA,
  ROOT_SCHEMA,
  LIST_ROOTS_RESULT_SCHEMA,
  REQUEST_SCHEMAS,
  RESPONSE_SCHEMAS,
} from "./schemas";

describe("MCP Schemas", () => {
  describe("JSON-RPC Base Schemas", () => {
    it("should have correct JSON_RPC_MESSAGE_SCHEMA structure", () => {
      expect(JSON_RPC_MESSAGE_SCHEMA).toEqual({
        type: "object",
        properties: {
          jsonrpc: {
            type: "string",
            enum: ["2.0"],
          },
        },
        required: ["jsonrpc"],
        additionalProperties: true,
      });
    });

    it("should have correct JSON_RPC_REQUEST_SCHEMA structure", () => {
      expect(JSON_RPC_REQUEST_SCHEMA).toMatchObject({
        type: "object",
        properties: {
          jsonrpc: {
            type: "string",
            enum: ["2.0"],
          },
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
      });
    });

    it("should have correct JSON_RPC_RESPONSE_SCHEMA structure", () => {
      expect(JSON_RPC_RESPONSE_SCHEMA).toMatchObject({
        type: "object",
        required: ["jsonrpc", "id"],
        oneOf: [{ required: ["result"] }, { required: ["error"] }],
        additionalProperties: false,
      });
    });

    it("should have correct JSON_RPC_NOTIFICATION_SCHEMA structure", () => {
      expect(JSON_RPC_NOTIFICATION_SCHEMA).toMatchObject({
        type: "object",
        required: ["jsonrpc", "method"],
        additionalProperties: false,
      });
    });
  });

  describe("Client and Server Info Schemas", () => {
    it("should have correct CLIENT_INFO_SCHEMA structure", () => {
      expect(CLIENT_INFO_SCHEMA).toEqual({
        type: "object",
        properties: {
          name: { type: "string" },
          version: { type: "string" },
        },
        required: ["name", "version"],
        additionalProperties: false,
      });
    });

    it("should have correct SERVER_INFO_SCHEMA structure", () => {
      expect(SERVER_INFO_SCHEMA).toEqual({
        type: "object",
        properties: {
          name: { type: "string" },
          version: { type: "string" },
        },
        required: ["name", "version"],
        additionalProperties: false,
      });
    });
  });

  describe("Initialize Schemas", () => {
    it("should have correct INITIALIZE_PARAMS_SCHEMA structure", () => {
      expect(INITIALIZE_PARAMS_SCHEMA).toMatchObject({
        type: "object",
        properties: {
          protocolVersion: {
            type: "string",
            enum: ["2024-11-05", "2025-03-26"],
          },
          clientInfo: CLIENT_INFO_SCHEMA,
          capabilities: expect.any(Object),
        },
        required: ["protocolVersion", "clientInfo", "capabilities"],
        additionalProperties: false,
      });
    });

    it("should have correct INITIALIZE_RESULT_SCHEMA structure", () => {
      expect(INITIALIZE_RESULT_SCHEMA).toMatchObject({
        type: "object",
        properties: {
          protocolVersion: {
            type: "string",
            enum: ["2024-11-05", "2025-03-26"],
          },
          serverInfo: SERVER_INFO_SCHEMA,
          capabilities: expect.any(Object),
        },
        required: ["protocolVersion", "serverInfo", "capabilities"],
        additionalProperties: false,
      });
    });
  });

  describe("Resource Schemas", () => {
    it("should have correct RESOURCE_SCHEMA structure", () => {
      expect(RESOURCE_SCHEMA).toEqual({
        type: "object",
        properties: {
          uri: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          mimeType: { type: "string" },
        },
        required: ["uri", "name"],
        additionalProperties: false,
      });
    });

    it("should have correct RESOURCE_TEMPLATE_SCHEMA structure", () => {
      expect(RESOURCE_TEMPLATE_SCHEMA).toEqual({
        type: "object",
        properties: {
          uriTemplate: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          mimeType: { type: "string" },
        },
        required: ["uriTemplate", "name"],
        additionalProperties: false,
      });
    });

    it("should have correct RESOURCE_CONTENT_SCHEMA structure", () => {
      expect(RESOURCE_CONTENT_SCHEMA).toMatchObject({
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
      });
    });

    it("should have correct LIST_RESOURCES_RESULT_SCHEMA structure", () => {
      expect(LIST_RESOURCES_RESULT_SCHEMA).toMatchObject({
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
      });
    });

    it("should have correct READ_RESOURCE_PARAMS_SCHEMA structure", () => {
      expect(READ_RESOURCE_PARAMS_SCHEMA).toEqual({
        type: "object",
        properties: {
          uri: { type: "string" },
        },
        required: ["uri"],
        additionalProperties: false,
      });
    });

    it("should have correct READ_RESOURCE_RESULT_SCHEMA structure", () => {
      expect(READ_RESOURCE_RESULT_SCHEMA).toMatchObject({
        type: "object",
        properties: {
          contents: {
            type: "array",
            items: RESOURCE_CONTENT_SCHEMA,
          },
        },
        required: ["contents"],
        additionalProperties: false,
      });
    });
  });

  describe("Tool Schemas", () => {
    it("should have correct TOOL_SCHEMA structure", () => {
      expect(TOOL_SCHEMA).toMatchObject({
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
      });
    });

    it("should have correct LIST_TOOLS_RESULT_SCHEMA structure", () => {
      expect(LIST_TOOLS_RESULT_SCHEMA).toMatchObject({
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
      });
    });

    it("should have correct CALL_TOOL_PARAMS_SCHEMA structure", () => {
      expect(CALL_TOOL_PARAMS_SCHEMA).toEqual({
        type: "object",
        properties: {
          name: { type: "string" },
          arguments: { type: "object" },
        },
        required: ["name"],
        additionalProperties: false,
      });
    });

    it("should have correct TOOL_CONTENT_SCHEMA with oneOf variants", () => {
      expect(TOOL_CONTENT_SCHEMA).toMatchObject({
        type: "object",
        oneOf: expect.arrayContaining([
          expect.objectContaining({
            type: "object",
            properties: {
              type: { type: "string", enum: ["text"] },
              text: { type: "string" },
            },
          }),
          expect.objectContaining({
            type: "object",
            properties: {
              type: { type: "string", enum: ["image"] },
              data: { type: "string" },
              mimeType: { type: "string" },
            },
          }),
          expect.objectContaining({
            type: "object",
            properties: {
              type: { type: "string", enum: ["resource"] },
              resource: RESOURCE_CONTENT_SCHEMA,
            },
          }),
        ]),
      });
    });

    it("should have correct CALL_TOOL_RESULT_SCHEMA structure", () => {
      expect(CALL_TOOL_RESULT_SCHEMA).toMatchObject({
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
      });
    });
  });

  describe("Prompt Schemas", () => {
    it("should have correct PROMPT_ARGUMENT_SCHEMA structure", () => {
      expect(PROMPT_ARGUMENT_SCHEMA).toEqual({
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          required: { type: "boolean" },
        },
        required: ["name"],
        additionalProperties: false,
      });
    });

    it("should have correct PROMPT_SCHEMA structure", () => {
      expect(PROMPT_SCHEMA).toMatchObject({
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
      });
    });

    it("should have correct LIST_PROMPTS_RESULT_SCHEMA structure", () => {
      expect(LIST_PROMPTS_RESULT_SCHEMA).toMatchObject({
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
      });
    });

    it("should have correct GET_PROMPT_PARAMS_SCHEMA structure", () => {
      expect(GET_PROMPT_PARAMS_SCHEMA).toEqual({
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
      });
    });

    it("should have correct MESSAGE_CONTENT_SCHEMA with oneOf variants", () => {
      expect(MESSAGE_CONTENT_SCHEMA).toMatchObject({
        type: "object",
        oneOf: expect.arrayContaining([
          expect.objectContaining({
            type: "object",
            properties: {
              type: { type: "string", enum: ["text"] },
              text: { type: "string" },
            },
          }),
          expect.objectContaining({
            type: "object",
            properties: {
              type: { type: "string", enum: ["image"] },
              data: { type: "string" },
              mimeType: { type: "string" },
            },
          }),
        ]),
      });
    });

    it("should have correct PROMPT_MESSAGE_SCHEMA structure", () => {
      expect(PROMPT_MESSAGE_SCHEMA).toMatchObject({
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
      });
    });

    it("should have correct GET_PROMPT_RESULT_SCHEMA structure", () => {
      expect(GET_PROMPT_RESULT_SCHEMA).toMatchObject({
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
      });
    });
  });

  describe("Sampling Schemas", () => {
    it("should have correct MODEL_HINT_SCHEMA structure", () => {
      expect(MODEL_HINT_SCHEMA).toEqual({
        type: "object",
        properties: {
          name: { type: "string" },
        },
        additionalProperties: false,
      });
    });

    it("should have correct MODEL_PREFERENCES_SCHEMA structure", () => {
      expect(MODEL_PREFERENCES_SCHEMA).toMatchObject({
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
      });
    });

    it("should have correct SAMPLING_MESSAGE_SCHEMA structure", () => {
      expect(SAMPLING_MESSAGE_SCHEMA).toMatchObject({
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
      });
    });

    it("should have correct CREATE_MESSAGE_PARAMS_SCHEMA structure", () => {
      expect(CREATE_MESSAGE_PARAMS_SCHEMA).toMatchObject({
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
      });
    });

    it("should have correct CREATE_MESSAGE_RESULT_SCHEMA structure", () => {
      expect(CREATE_MESSAGE_RESULT_SCHEMA).toMatchObject({
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
      });
    });
  });

  describe("Logging and Root Schemas", () => {
    it("should have correct LOGGING_MESSAGE_PARAMS_SCHEMA structure", () => {
      expect(LOGGING_MESSAGE_PARAMS_SCHEMA).toEqual({
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
      });
    });

    it("should have correct ROOT_SCHEMA structure", () => {
      expect(ROOT_SCHEMA).toEqual({
        type: "object",
        properties: {
          uri: { type: "string" },
          name: { type: "string" },
        },
        required: ["uri", "name"],
        additionalProperties: false,
      });
    });

    it("should have correct LIST_ROOTS_RESULT_SCHEMA structure", () => {
      expect(LIST_ROOTS_RESULT_SCHEMA).toMatchObject({
        type: "object",
        properties: {
          roots: {
            type: "array",
            items: ROOT_SCHEMA,
          },
        },
        required: ["roots"],
        additionalProperties: false,
      });
    });
  });

  describe("Schema Mappings", () => {
    it("should have REQUEST_SCHEMAS mapping with correct methods", () => {
      expect(REQUEST_SCHEMAS).toMatchObject({
        initialize: INITIALIZE_PARAMS_SCHEMA,
        "resources/list": LIST_RESOURCES_PARAMS_SCHEMA,
        "resources/read": READ_RESOURCE_PARAMS_SCHEMA,
        "tools/list": LIST_TOOLS_PARAMS_SCHEMA,
        "tools/call": CALL_TOOL_PARAMS_SCHEMA,
        "prompts/list": LIST_PROMPTS_PARAMS_SCHEMA,
        "prompts/get": GET_PROMPT_PARAMS_SCHEMA,
        "sampling/createMessage": CREATE_MESSAGE_PARAMS_SCHEMA,
        "logging/setLevel": LOGGING_MESSAGE_PARAMS_SCHEMA,
      });
    });

    it("should have RESPONSE_SCHEMAS mapping with correct methods", () => {
      expect(RESPONSE_SCHEMAS).toMatchObject({
        initialize: INITIALIZE_RESULT_SCHEMA,
        "resources/list": LIST_RESOURCES_RESULT_SCHEMA,
        "resources/read": READ_RESOURCE_RESULT_SCHEMA,
        "tools/list": LIST_TOOLS_RESULT_SCHEMA,
        "tools/call": CALL_TOOL_RESULT_SCHEMA,
        "prompts/list": LIST_PROMPTS_RESULT_SCHEMA,
        "prompts/get": GET_PROMPT_RESULT_SCHEMA,
        "sampling/createMessage": CREATE_MESSAGE_RESULT_SCHEMA,
        "roots/list": LIST_ROOTS_RESULT_SCHEMA,
      });
    });

    it("should have all expected request methods", () => {
      const expectedMethods = [
        "initialize",
        "resources/list",
        "resources/read",
        "tools/list",
        "tools/call",
        "prompts/list",
        "prompts/get",
        "sampling/createMessage",
        "logging/setLevel",
      ];

      expect(Object.keys(REQUEST_SCHEMAS)).toEqual(expect.arrayContaining(expectedMethods));
    });

    it("should have all expected response methods", () => {
      const expectedMethods = [
        "initialize",
        "resources/list",
        "resources/read",
        "tools/list",
        "tools/call",
        "prompts/list",
        "prompts/get",
        "sampling/createMessage",
        "roots/list",
      ];

      expect(Object.keys(RESPONSE_SCHEMAS)).toEqual(expect.arrayContaining(expectedMethods));
    });
  });

  describe("Schema Properties", () => {
    it("should have schemas with proper object types", () => {
      const allSchemas = [
        JSON_RPC_MESSAGE_SCHEMA,
        JSON_RPC_REQUEST_SCHEMA,
        JSON_RPC_RESPONSE_SCHEMA,
        CLIENT_INFO_SCHEMA,
        SERVER_INFO_SCHEMA,
        RESOURCE_SCHEMA,
        TOOL_SCHEMA,
        PROMPT_SCHEMA,
      ];

      allSchemas.forEach((schema) => {
        expect(schema.type).toBe("object");
        expect(schema.properties).toBeDefined();
      });
    });

    it("should have proper required fields in key schemas", () => {
      expect(JSON_RPC_REQUEST_SCHEMA.required).toContain("jsonrpc");
      expect(JSON_RPC_REQUEST_SCHEMA.required).toContain("id");
      expect(JSON_RPC_REQUEST_SCHEMA.required).toContain("method");

      expect(TOOL_SCHEMA.required).toContain("name");
      expect(TOOL_SCHEMA.required).toContain("inputSchema");

      expect(RESOURCE_SCHEMA.required).toContain("uri");
      expect(RESOURCE_SCHEMA.required).toContain("name");
    });
  });
});
