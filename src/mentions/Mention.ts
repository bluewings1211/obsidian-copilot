import { ImageProcessor } from "@/imageProcessing/imageProcessor";
import { isYoutubeUrl } from "@/utils";
import { McpManager } from "@/mcp/manager";

export interface MentionData {
  type: string;
  original: string;
  processed?: string;
}

export interface FetchResponse {
  response: string;
  elapsed_time_ms: number;
}

export class Mention {
  private static instance: Mention;
  private mentions: Map<string, MentionData>;
  private mcpManager?: McpManager;

  private constructor() {
    this.mentions = new Map();
  }

  static getInstance(): Mention {
    if (!Mention.instance) {
      Mention.instance = new Mention();
    }
    return Mention.instance;
  }

  /**
   * Set the MCP manager instance
   */
  setMcpManager(mcpManager: McpManager): void {
    this.mcpManager = mcpManager;
  }

  extractAllUrls(text: string): string[] {
    // Match URLs and trim any trailing commas
    const urlRegex = /https?:\/\/[^\s"'<>]+/g;
    return (text.match(urlRegex) || [])
      .map((url) => url.replace(/,+$/, "")) // Remove trailing commas
      .filter((url, index, self) => self.indexOf(url) === index); // Remove duplicates
  }

  extractUrls(text: string): string[] {
    const urlRegex = /https?:\/\/[^\s"'<>]+/g;
    return (text.match(urlRegex) || [])
      .map((url) => url.replace(/,+$/, ""))
      .filter((url, index, self) => self.indexOf(url) === index)
      .filter((url) => !isYoutubeUrl(url));
  }

  async processUrl(url: string): Promise<FetchResponse> {
    try {
      if (!this.mcpManager) {
        console.warn("MCP manager not available, returning original URL");
        return { response: url, elapsed_time_ms: 0 };
      }

      // Find the fetch server
      const servers = this.mcpManager.getServerStatuses();
      const fetchServer = servers.find(
        (server) => server.name === "fetch" && server.state === "connected"
      );

      if (!fetchServer) {
        console.warn("Fetch MCP server not available, returning original URL");
        return { response: url, elapsed_time_ms: 0 };
      }

      const startTime = Date.now();

      // Call the fetch tool
      const result = await this.mcpManager.callTool(fetchServer.id, {
        name: "fetch",
        arguments: {
          url: url,
          max_length: 5000,
        },
      });

      const elapsed = Date.now() - startTime;

      // Extract content from the result
      let content = url; // fallback
      if (result.content && Array.isArray(result.content)) {
        // Find text content in the result
        const textContent = result.content.find((item) => item.type === "text");
        if (textContent && textContent.text) {
          content = textContent.text;
        }
      }

      return { response: content, elapsed_time_ms: elapsed };
    } catch (error) {
      console.error(`Error processing URL ${url} with MCP fetch:`, error);
      return { response: url, elapsed_time_ms: 0 };
    }
  }

  // For non-youtube URLs
  async processUrls(text: string): Promise<{ urlContext: string; imageUrls: string[] }> {
    const urls = this.extractUrls(text);
    let urlContext = "";
    const imageUrls: string[] = [];

    // Return empty string if no URLs to process
    if (urls.length === 0) {
      return { urlContext: "", imageUrls: [] };
    }

    // Process all URLs concurrently
    const processPromises = urls.map(async (url) => {
      // Check if it's an image URL
      if (await ImageProcessor.isImageUrl(url, app.vault)) {
        imageUrls.push(url);
        return null;
      }

      if (!this.mentions.has(url)) {
        const processed = await this.processUrl(url);
        this.mentions.set(url, {
          type: "url",
          original: url,
          processed: processed.response,
        });
      }
      return this.mentions.get(url);
    });

    const processedUrls = await Promise.all(processPromises);

    // Append all processed content
    processedUrls.forEach((urlData) => {
      if (urlData?.processed) {
        urlContext += `\n\nContent from ${urlData.original}:\n${urlData.processed}`;
      }
    });

    return { urlContext, imageUrls };
  }

  getMentions(): Map<string, MentionData> {
    return this.mentions;
  }

  clearMentions(): void {
    this.mentions.clear();
  }
}
