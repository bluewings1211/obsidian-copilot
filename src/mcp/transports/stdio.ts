/**
 * STDIO Transport Implementation for MCP
 *
 * This transport implementation handles communication with MCP servers
 * via standard input/output streams by spawning child processes.
 */

import { spawn, ChildProcess } from "child_process";
import type { Transport, TransportState, JsonRpcMessage, StdioTransportConfig } from "../types";
import { isJsonRpcMessage } from "../utils";

/**
 * STDIO transport for MCP communication
 */
export class StdioTransport implements Transport {
  private config: StdioTransportConfig;
  private process: ChildProcess | null = null;
  private _state: TransportState = "disconnected";
  private messageBuffer = "";

  // Event handlers
  public onmessage?: (message: JsonRpcMessage) => void;
  public onerror?: (error: Error) => void;
  public onclose?: () => void;

  constructor(config: StdioTransportConfig) {
    this.config = config;
  }

  public get state(): TransportState {
    return this._state;
  }

  /**
   * Start the transport by spawning the MCP server process
   */
  public async start(): Promise<void> {
    if (this._state !== "disconnected") {
      throw new Error("Transport already started");
    }

    this._state = "connecting";

    try {
      // Spawn the MCP server process
      const envVars: Record<string, string> = {
        ...process.env,
        ...this.config.env,
        // Disable npm funding messages and other noise
        NPM_CONFIG_FUND: "false",
        NPM_CONFIG_AUDIT: "false",
        NPM_CONFIG_UPDATE_NOTIFIER: "false",
        SUPPRESS_NO_CONFIG_WARNING: "true",
      };

      // Ensure PATH includes common binary directories if not already present
      const commonPaths = [
        "/usr/local/bin",
        process.env.HOME + "/.local/bin",
        "/opt/homebrew/bin",
      ].filter(Boolean);

      if (envVars.PATH) {
        for (const path of commonPaths) {
          if (!envVars.PATH.includes(path)) {
            envVars.PATH = `${path}:${envVars.PATH}`;
          }
        }
      }

      this.process = spawn(this.config.command, this.config.args || [], {
        env: envVars,
        cwd: this.config.cwd,
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Set up event handlers
      this.setupProcessHandlers();

      // Wait for process to be ready
      await this.waitForReady();

      this._state = "connected";
    } catch (error) {
      this._state = "disconnected";
      throw error;
    }
  }

  /**
   * Send a JSON-RPC message to the server
   */
  public async send(message: JsonRpcMessage): Promise<void> {
    if (this._state !== "connected" || !this.process?.stdin) {
      throw new Error("Transport not connected");
    }

    const messageStr = JSON.stringify(message) + "\n";

    return new Promise((resolve, reject) => {
      this.process!.stdin!.write(messageStr, (error) => {
        if (error) {
          reject(new Error(`Failed to send message: ${error.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Close the transport and terminate the process
   */
  public async close(): Promise<void> {
    if (this._state === "disconnected") {
      return;
    }

    this._state = "disconnecting";

    if (this.process) {
      // Send SIGTERM first, then SIGKILL if necessary
      this.process.kill("SIGTERM");

      // Give the process some time to exit gracefully
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.process && !this.process.killed) {
            this.process.kill("SIGKILL");
          }
          resolve();
        }, 5000);

        this.process!.on("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.process = null;
    }

    this._state = "disconnected";
  }

  /**
   * Set up process event handlers
   */
  private setupProcessHandlers(): void {
    if (!this.process) return;

    // Handle stdout (server messages)
    this.process.stdout?.on("data", (data: Buffer) => {
      this.handleStdoutData(data.toString());
    });

    // Handle stderr (server errors/logs)
    this.process.stderr?.on("data", (data: Buffer) => {
      const errorMsg = data.toString().trim();
      if (errorMsg) {
        console.warn(`[MCP Server] ${errorMsg}`);
      }
    });

    // Handle process exit
    this.process.on("exit", (code, signal) => {
      this._state = "disconnected";

      if (code !== 0 && code !== null) {
        const error = new Error(`MCP server exited with code ${code}`);
        this.onerror?.(error);
      } else if (signal) {
        const error = new Error(`MCP server terminated by signal ${signal}`);
        this.onerror?.(error);
      }

      this.onclose?.();
    });

    // Handle process errors
    this.process.on("error", (error) => {
      this._state = "disconnected";
      this.onerror?.(new Error(`Process error: ${error.message}`));
    });
  }

  /**
   * Handle data from stdout
   */
  private handleStdoutData(data: string): void {
    this.messageBuffer += data;

    // Process complete lines (JSON-RPC messages are line-delimited)
    const lines = this.messageBuffer.split("\n");
    this.messageBuffer = lines.pop() || ""; // Keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        this.processMessage(trimmed);
      }
    }
  }

  /**
   * Process a single message line
   */
  private processMessage(messageStr: string): void {
    try {
      const message = JSON.parse(messageStr);

      if (isJsonRpcMessage(message)) {
        this.onmessage?.(message);
      } else {
        // Log non-JSON-RPC messages as warnings instead of errors
        console.warn(`[MCP Server] Non-JSON-RPC message: ${messageStr}`);
      }
    } catch {
      // Filter out common non-JSON messages that shouldn't be treated as errors
      const lowerMsg = messageStr.toLowerCase();
      if (
        lowerMsg.includes("packages are looking for funding") ||
        lowerMsg.includes("npm notice") ||
        lowerMsg.includes("npm warn") ||
        (lowerMsg.includes("found ") && lowerMsg.includes("vulnerabilities")) ||
        lowerMsg.startsWith("added ") ||
        lowerMsg.startsWith("removed ") ||
        lowerMsg.startsWith("changed ") ||
        lowerMsg.startsWith("audited ")
      ) {
        // These are informational messages from npm/package managers, not errors
        console.debug(`[MCP Server] Info: ${messageStr}`);
      } else {
        // Only treat actual JSON parsing failures as errors
        console.warn(`[MCP Server] Failed to parse message: ${messageStr}`);
      }
    }
  }

  /**
   * Wait for the process to be ready for communication
   */
  private async waitForReady(): Promise<void> {
    if (!this.process) {
      throw new Error("Process not started");
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Process startup timeout"));
      }, 10000); // 10 second timeout

      // Check if process is already running
      if (this.process!.pid) {
        clearTimeout(timeout);
        resolve();
        return;
      }

      // Wait for spawn event
      this.process!.on("spawn", () => {
        clearTimeout(timeout);
        resolve();
      });

      // Handle startup errors
      this.process!.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      this.process!.on("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`Process exited during startup with code ${code}`));
      });
    });
  }
}
