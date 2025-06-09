# AG-UI Integration for Obsidian Copilot

This directory contains the AG-UI (Agent UI) integration for Obsidian Copilot, providing an enhanced conversational AI experience with human-in-the-loop capabilities, tool execution, and MCP (Model Context Protocol) integration.

## Overview

The AG-UI integration extends Obsidian Copilot with:

- **Agent-based conversations** with structured event streams
- **Human-in-the-loop tools** for interactive decision making
- **MCP tool integration** for external service connections
- **Real-time event handling** with streaming responses
- **Enhanced Obsidian context** awareness

## Architecture

### Core Components

1. **AGUIIntegration** (`index.ts`) - Main integration manager
2. **SimpleAgentWrapper** (`simple-agent-wrapper.ts`) - Simplified agent implementation
3. **AGUIEventBridge** (`event-bridge.ts`) - Event system bridge
4. **InteractiveToolManager** (`interactive-tools.ts`) - Human-in-the-loop tools
5. **AGUIModal** (`ui-components.ts`) - UI components for interaction

### File Structure

```
src/ag-ui/
├── index.ts                 # Main integration manager
├── simple-agent-wrapper.ts  # Agent wrapper implementation
├── event-bridge.ts          # Event system bridge
├── interactive-tools.ts     # Interactive tool definitions
├── ui-components.ts         # UI components
├── obsidian-agent.ts        # Full AG-UI agent (experimental)
└── README.md               # This documentation
```

## Usage

### Basic Integration

```typescript
import { AGUIIntegration } from "./ag-ui";

// Initialize AG-UI integration
const agui = new AGUIIntegration(
  app, // Obsidian App instance
  chainManager, // Existing ChainManager
  settings, // CopilotSettings
  mcpManager // Optional MCP Manager
);

// Initialize the integration
await agui.initialize();

// Process a conversation
const result = await agui.processConversation(
  messages, // Array of messages
  tools, // Available tools (optional)
  context, // Additional context (optional)
  onEvent // Event handler (optional)
);
```

### Event Handling

```typescript
// Handle AG-UI events in real-time
const onEvent = (event) => {
  switch (event.type) {
    case "TEXT_MESSAGE_START":
      console.log("Assistant started responding");
      break;
    case "TEXT_MESSAGE_CONTENT":
      console.log("Content delta:", event.delta);
      break;
    case "TOOL_CALL_START":
      console.log("Tool call started:", event.toolCallName);
      break;
    case "RUN_FINISHED":
      console.log("Conversation completed");
      break;
  }
};
```

### Interactive Tools

The integration provides several human-in-the-loop tools:

1. **confirmAction** - Ask user to confirm an action
2. **getUserChoice** - Present multiple options for selection
3. **updateProgress** - Show progress information
4. **requestInput** - Request specific input from user

```typescript
// Execute an interactive tool
const result = await agui.executeInteractiveTool("confirmAction", {
  action: "Delete this file",
  importance: "high",
  details: "This action cannot be undone",
});
```

### MCP Integration

MCP tools are automatically loaded and prefixed with `mcp_`:

```typescript
// Get all available tools (including MCP)
const tools = await agui.getAvailableTools();

// Execute an MCP tool
const result = await agui.executeTool("mcp_file_read", {
  path: "/path/to/file.txt",
});
```

### UI Components

Show the AG-UI interface:

```typescript
import { showAGUIModal } from "./ag-ui/ui-components";

// Show the AG-UI modal
showAGUIModal(app, agui);
```

## Configuration

### Settings Integration

The AG-UI integration respects existing Copilot settings and can be updated dynamically:

```typescript
// Update settings
await agui.updateSettings(newSettings, newMcpManager);
```

### Context Enhancement

The integration automatically includes Obsidian context:

- Active file information
- Current selection
- Cursor position
- Vault metadata

## Event Types

### Conversation Events

- `RUN_STARTED` - Conversation processing started
- `RUN_FINISHED` - Conversation processing completed
- `RUN_ERROR` - Error during processing

### Message Events

- `TEXT_MESSAGE_START` - Assistant response started
- `TEXT_MESSAGE_CONTENT` - Response content delta
- `TEXT_MESSAGE_END` - Assistant response completed

### Tool Events

- `TOOL_CALL_START` - Tool execution started
- `TOOL_CALL_END` - Tool execution completed
- `STEP_STARTED` - Processing step started
- `STEP_FINISHED` - Processing step completed

## Interactive Tools Reference

### confirmAction

Ask user to confirm a specific action.

```typescript
{
  action: string,        // Action description
  importance?: string,   // "low" | "medium" | "high" | "critical"
  details?: string       // Additional details
}
```

### getUserChoice

Present multiple options for user selection.

```typescript
{
  question: string,      // Question to ask
  options: string[],     // Available options
  allowMultiple?: boolean // Allow multiple selection
}
```

### updateProgress

Show progress information to user.

```typescript
{
  message: string,       // Progress message
  percentage?: number,   // Progress percentage (0-100)
  stage?: string        // Current stage
}
```

### requestInput

Request specific input from user.

```typescript
{
  prompt: string,        // Input prompt
  inputType?: string,    // "text" | "number" | "date" | "file" | "password"
  placeholder?: string,  // Placeholder text
  required?: boolean     // Whether input is required
}
```

## Advanced Usage

### Custom Event Handlers

```typescript
class CustomEventHandler {
  handleEvent(event) {
    // Custom event processing
    this.processEvent(event);
  }

  processEvent(event) {
    // Your custom logic here
  }
}

const handler = new CustomEventHandler();
await agui.processConversation(messages, tools, context, handler.handleEvent.bind(handler));
```

### Tool Development

Create custom tools that integrate with the system:

```typescript
const customTool = {
  name: "customAction",
  description: "Perform a custom action",
  parameters: {
    type: "object",
    properties: {
      input: { type: "string", description: "Input parameter" },
    },
    required: ["input"],
  },
};

// Add to available tools
const tools = await agui.getAvailableTools();
tools.push(customTool);
```

### State Management

Access and monitor agent state:

```typescript
// Get current agent state
const state = agui.getAgentState();

// Monitor status
const status = agui.getStatus();
console.log("Initialized:", status.initialized);
console.log("MCP Connections:", status.mcpConnections);
```

## Troubleshooting

### Common Issues

1. **RxJS Version Conflicts**: The integration uses a simplified approach to avoid RxJS version conflicts between Obsidian and AG-UI.

2. **Tool Execution Failures**: Check tool parameters and ensure MCP connections are active.

3. **Event Handler Errors**: Ensure event handlers don't throw unhandled exceptions.

### Debug Mode

Enable debug logging:

```typescript
// Check if AG-UI is available
if (agui.isAvailable()) {
  console.log("AG-UI Status:", agui.getStatus());
} else {
  console.log("AG-UI not available");
}
```

### Error Handling

```typescript
try {
  await agui.processConversation(messages);
} catch (error) {
  console.error("AG-UI Error:", error);
  // Handle error appropriately
}
```

## Future Enhancements

- Full AbstractAgent inheritance support
- Enhanced streaming capabilities
- Additional interactive tool types
- Better error recovery
- Performance optimizations

## License

This integration follows the same license as Obsidian Copilot.
