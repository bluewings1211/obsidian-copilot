import { getStandaloneQuestion } from "@/chainUtils";
import {
  EMPTY_INDEX_ERROR_MESSAGE,
  PLUS_MODE_DEFAULT_SOURCE_CHUNKS,
  TEXT_WEIGHT,
} from "@/constants";
import { CustomError } from "@/error";
import { HybridRetriever } from "@/search/hybridRetriever";
import VectorStoreManager from "@/search/vectorStoreManager";
import { getSettings } from "@/settings/model";
import { TimeInfo } from "@/tools/TimeTools";
import { tool } from "@langchain/core/tools";
import { requestUrl } from "obsidian";
import { z } from "zod";

const localSearchTool = tool(
  async ({
    timeRange,
    query,
    salientTerms,
  }: {
    timeRange?: { startTime: TimeInfo; endTime: TimeInfo };
    query: string;
    salientTerms: string[];
  }) => {
    const indexEmpty = await VectorStoreManager.getInstance().isIndexEmpty();
    if (indexEmpty) {
      throw new CustomError(EMPTY_INDEX_ERROR_MESSAGE);
    }

    const returnAll = timeRange !== undefined;
    const maxSourceChunks =
      getSettings().maxSourceChunks < PLUS_MODE_DEFAULT_SOURCE_CHUNKS
        ? PLUS_MODE_DEFAULT_SOURCE_CHUNKS
        : getSettings().maxSourceChunks;

    if (getSettings().debug) {
      console.log("returnAll:", returnAll);
    }

    const hybridRetriever = new HybridRetriever({
      minSimilarityScore: returnAll ? 0.0 : 0.1,
      maxK: returnAll ? 1000 : maxSourceChunks,
      salientTerms,
      timeRange: timeRange
        ? {
            startTime: timeRange.startTime.epoch,
            endTime: timeRange.endTime.epoch,
          }
        : undefined,
      textWeight: TEXT_WEIGHT,
      returnAll: returnAll,
      // Voyage AI reranker did worse than Orama in some cases, so only use it if
      // Orama did not return anything higher than this threshold
      useRerankerThreshold: 0.5,
    });

    // Perform the search
    const documents = await hybridRetriever.getRelevantDocuments(query);

    // Format the results
    const formattedResults = documents.map((doc) => ({
      title: doc.metadata.title,
      content: doc.pageContent,
      path: doc.metadata.path,
      score: doc.metadata.score,
      rerank_score: doc.metadata.rerank_score,
      includeInContext: doc.metadata.includeInContext,
    }));

    return JSON.stringify(formattedResults);
  },
  {
    name: "localSearch",
    description: "Search for notes based on the time range and query",
    schema: z.object({
      timeRange: z
        .object({
          startTime: z.any(),
          endTime: z.any(),
        })
        .optional(),
      query: z.string().describe("The search query"),
      salientTerms: z.array(z.string()).describe("List of salient terms extracted from the query"),
    }),
  }
);

const indexTool = tool(
  async () => {
    try {
      const indexedCount = await VectorStoreManager.getInstance().indexVaultToVectorStore();
      const indexResultPrompt = `Please report whether the indexing was successful.\nIf success is true, just say it is successful. If 0 files is indexed, say there are no new files to index.`;
      return (
        indexResultPrompt +
        JSON.stringify({
          success: true,
          message:
            indexedCount === 0
              ? "No new files to index."
              : `Indexed ${indexedCount} files in the vault.`,
        })
      );
    } catch (error) {
      console.error("Error indexing vault:", error);
      return JSON.stringify({
        success: false,
        message: "An error occurred while indexing the vault.",
      });
    }
  },
  {
    name: "indexVault",
    description: "Index the vault to the Copilot index",
  }
);

// Add new web search tool
const webSearchTool = tool(
  async ({ query, chatHistory }: { query: string; chatHistory: [string, string][] }) => {
    try {
      const settings = getSettings();
      if (!settings.braveSearchApiKey) {
        console.error("Brave Search API key not found.");
        return "Brave Search API key not configured. Please add it in the settings.";
      }

      // Get standalone question considering chat history
      const standaloneQuestion = await getStandaloneQuestion(query, chatHistory);

      const response = await requestUrl({
        url: `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
          standaloneQuestion
        )}`,
        method: "GET",
        headers: {
          "X-Subscription-Token": settings.braveSearchApiKey,
          Accept: "application/json",
        },
      });

      if (response.status !== 200) {
        console.error("Brave Search API error:", response.json);
        return `Error fetching search results: ${response.status}`;
      }

      const searchResults = response.json;
      let formattedResults = "";
      const sources: string[] = [];

      if (searchResults.web && searchResults.web.results) {
        searchResults.web.results.forEach((result: any, index: number) => {
          formattedResults += `[${index + 1}] ${result.title}\n${result.description}\nURL: ${
            result.url
          }\n\n`;
          sources.push(`[${index + 1}] [${result.title || result.url}](${result.url})`);
        });
      }

      const citationsList = sources.length > 0 ? "\n\n#### Sources\n" + sources.join("\n") : "";

      return (
        "Here are the web search results. Please provide a response based on this information and include source citations listed at the end of your response under the heading '#### Sources' as a list of markdown links. For each URL, create a descriptive title based on the domain and path and return it in the markdown format '- [title](url)':\n\n" +
        formattedResults +
        citationsList
      );
    } catch (error) {
      console.error(`Error processing web search query ${query}:`, error);
      return `Error processing web search: ${error.message}`;
    }
  },
  {
    name: "webSearch",
    description: "Search the web for information",
    schema: z.object({
      query: z.string().describe("The search query"),
      chatHistory: z
        .array(z.tuple([z.string(), z.string()]))
        .describe("Previous conversation turns"),
    }),
  }
);

export { indexTool, localSearchTool, webSearchTool };
