/**
 * Server-Sent Events (SSE) Transport Implementation for MCP
 *
 * This transport implementation handles communication with MCP servers
 * via Server-Sent Events over HTTP/HTTPS.
 */

import type { Transport, TransportState, JsonRpcMessage, SseTransportConfig } from "../types";
import { isJsonRpcMessage } from "../utils";

/**
 * SSE transport for MCP communication
 */
export class SseTransport implements Transport {
  private config: SseTransportConfig;
  private eventSource: EventSource | null = null;
  private _state: TransportState = "disconnected";

  // Event handlers
  public onmessage?: (message: JsonRpcMessage) => void;
  public onerror?: (error: Error) => void;
  public onclose?: () => void;

  constructor(config: SseTransportConfig) {
    this.config = config;
  }

  public get state(): TransportState {
    return this._state;
  }

  /**
   * Start the transport by connecting to the SSE endpoint
   */
  public async start(): Promise<void> {
    if (this._state !== "disconnected") {
      throw new Error("Transport already started");
    }

    this._state = "connecting";

    try {
      // Create EventSource connection
      this.eventSource = new EventSource(this.config.url);

      // Set up event handlers
      this.setupEventSourceHandlers();

      // Wait for connection to be established
      await this.waitForConnection();

      this._state = "connected";
    } catch (error) {
      this._state = "disconnected";
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }
      throw error;
    }
  }

  /**
   * Send a JSON-RPC message to the server
   * Note: SSE is typically one-way (server->client), but we can use HTTP POST for client->server
   */
  public async send(message: JsonRpcMessage): Promise<void> {
    if (this._state !== "connected") {
      throw new Error("Transport not connected");
    }

    try {
      const response = await fetch(this.config.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.config.headers,
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      throw new Error(
        `Failed to send message: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Close the transport
   */
  public async close(): Promise<void> {
    if (this._state === "disconnected") {
      return;
    }

    this._state = "disconnecting";

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this._state = "disconnected";
  }

  /**
   * Set up EventSource event handlers
   */
  private setupEventSourceHandlers(): void {
    if (!this.eventSource) return;

    // Handle incoming messages
    this.eventSource.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    // Handle connection open
    this.eventSource.onopen = () => {
      // Connection established
    };

    // Handle errors
    this.eventSource.onerror = (event) => {
      const error = new Error("SSE connection error");

      if (this.eventSource?.readyState === EventSource.CLOSED) {
        this._state = "disconnected";
        this.onclose?.();
      } else {
        this.onerror?.(error);
      }
    };
  }

  /**
   * Handle incoming SSE message
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      if (isJsonRpcMessage(message)) {
        this.onmessage?.(message);
      } else {
        this.onerror?.(new Error(`Invalid JSON-RPC message: ${data}`));
      }
    } catch {
      this.onerror?.(new Error(`Failed to parse message: ${data}`));
    }
  }

  /**
   * Wait for the SSE connection to be established
   */
  private async waitForConnection(): Promise<void> {
    if (!this.eventSource) {
      throw new Error("EventSource not created");
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("SSE connection timeout"));
      }, 10000); // 10 second timeout

      const cleanup = () => {
        clearTimeout(timeout);
        if (this.eventSource) {
          this.eventSource.removeEventListener("open", onOpen);
          this.eventSource.removeEventListener("error", onError);
        }
      };

      const onOpen = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error("Failed to establish SSE connection"));
      };

      // Check if already connected
      if (this.eventSource?.readyState === EventSource.OPEN) {
        clearTimeout(timeout);
        resolve();
        return;
      }

      // Wait for connection
      this.eventSource?.addEventListener("open", onOpen);
      this.eventSource?.addEventListener("error", onError);
    });
  }
}
