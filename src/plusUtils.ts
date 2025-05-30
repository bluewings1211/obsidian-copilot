import { setChainType, setModelKey } from "@/aiParams";
import { ChainType } from "@/chainFactory";
import { CopilotPlusExpiredModal } from "@/components/modals/CopilotPlusExpiredModal";
import {
  ChatModelProviders,
  ChatModels,
  EmbeddingModelProviders,
  EmbeddingModels,
  PlusUtmMedium,
} from "@/constants";
// import { BrevilabsClient } from "@/LLMProviders/brevilabsClient"; // BrevilabsClient is no longer used
import VectorStoreManager from "@/search/vectorStoreManager";
import { getSettings, setSettings, updateSetting, useSettingsValue } from "@/settings/model";

// Using fallback models since Copilot Plus models are removed
export const DEFAULT_COPILOT_PLUS_CHAT_MODEL = ChatModels.GPT_41;
export const DEFAULT_COPILOT_PLUS_CHAT_MODEL_KEY =
  DEFAULT_COPILOT_PLUS_CHAT_MODEL + "|" + ChatModelProviders.OPENAI;
export const DEFAULT_COPILOT_PLUS_EMBEDDING_MODEL = EmbeddingModels.OPENAI_EMBEDDING_SMALL;
export const DEFAULT_COPILOT_PLUS_EMBEDDING_MODEL_KEY =
  DEFAULT_COPILOT_PLUS_EMBEDDING_MODEL + "|" + EmbeddingModelProviders.OPENAI;

/** Check if the model key is a Copilot Plus model. */
export function isPlusModel(modelKey: string): boolean {
  // Since Copilot Plus models are removed, always return false
  return false;
}

/** Hook to get the isPlusUser setting. */
export function useIsPlusUser(): boolean | undefined {
  const settings = useSettingsValue();
  return settings.isPlusUser;
}

/** Check if the user is a Plus user. */
export async function checkIsPlusUser(): Promise<boolean | undefined> {
  // const brevilabsClient = BrevilabsClient.getInstance(); // BrevilabsClient is no longer used
  // const result = await brevilabsClient.validateLicenseKey();
  // return result.isValid;
  // Placeholder: Determine "Plus" status based on Brave API key or other criteria
  return !!getSettings().braveSearchApiKey;
}

/** Check if the user is on the believer plan. */
export async function isBelieverPlan(): Promise<boolean> {
  // if (!getSettings().plusLicenseKey) { // This was for Brevilabs
  //   return false;
  // }
  // const brevilabsClient = BrevilabsClient.getInstance(); // BrevilabsClient is no longer used
  // const result = await brevilabsClient.validateLicenseKey();
  // return result.plan?.toLowerCase() === "believer";
  // Placeholder: Believer plan logic might need to be re-evaluated or removed
  return false; // Defaulting to false as Brevilabs is removed
}

/**
 * Apply the Copilot Plus settings.
 * WARNING! If the embedding model is changed, the vault will be indexed. Use it
 * with caution.
 */
export function applyPlusSettings(): void {
  // const defaultModelKey = DEFAULT_COPILOT_PLUS_CHAT_MODEL_KEY; // Removed
  // const embeddingModelKey = DEFAULT_COPILOT_PLUS_EMBEDDING_MODEL_KEY; // Removed
  const previousEmbeddingModelKey = getSettings().embeddingModelKey;
  // Fallback to a default OpenAI model if Plus models are removed
  const defaultModelKey = ChatModels.GPT_41 + "|" + ChatModelProviders.OPENAI;
  const embeddingModelKey =
    EmbeddingModels.OPENAI_EMBEDDING_SMALL + "|" + EmbeddingModelProviders.OPENAI;
  setModelKey(defaultModelKey);
  setChainType(ChainType.COPILOT_PLUS_CHAIN);
  setSettings({
    defaultModelKey,
    embeddingModelKey,
    defaultChainType: ChainType.COPILOT_PLUS_CHAIN,
  });
  if (previousEmbeddingModelKey !== embeddingModelKey) {
    VectorStoreManager.getInstance().indexVaultToVectorStore();
  }
}

export function createPlusPageUrl(medium: PlusUtmMedium): string {
  return `https://www.obsidiancopilot.com?utm_source=obsidian&utm_medium=${medium}`;
}

export function navigateToPlusPage(medium: PlusUtmMedium): void {
  window.open(createPlusPageUrl(medium), "_blank");
}

export function turnOnPlus(): void {
  updateSetting("isPlusUser", true);
}

export function turnOffPlus(): void {
  const previousIsPlusUser = getSettings().isPlusUser;
  updateSetting("isPlusUser", false);
  if (previousIsPlusUser) {
    new CopilotPlusExpiredModal(app).open();
  }
}
