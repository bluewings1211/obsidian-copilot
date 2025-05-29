// import { CopilotPlusWelcomeModal } from "@/components/modals/CopilotPlusWelcomeModal"; // Not used currently
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
// import { PasswordInput } from "@/components/ui/password-input"; // Not used
import { PLUS_UTM_MEDIUMS } from "@/constants";
import { checkIsPlusUser, navigateToPlusPage, useIsPlusUser } from "@/plusUtils";
import { useSettingsValue } from "@/settings/model"; // updateSetting removed
import { ExternalLink, Loader2 } from "lucide-react";
import React, { useState } from "react"; // useEffect removed

export function PlusSettings() {
  useSettingsValue(); // Call useSettingsValue to ensure settings are loaded, but not assigned to unused 'settings'
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const isPlusUser = useIsPlusUser();
  // const [localLicenseKey, setLocalLicenseKey] = useState(settings.plusLicenseKey); // Removed: plusLicenseKey is no longer in settings
  // useEffect(() => { // Removed
  //   setLocalLicenseKey(settings.plusLicenseKey);
  // }, [settings.plusLicenseKey]);

  return (
    <section className="flex flex-col gap-4 bg-secondary p-4 rounded-lg">
      <div className="text-xl font-bold flex items-center gap-2 justify-between">
        <span>Copilot Plus (beta)</span>
        {isPlusUser && (
          <Badge variant="outline" className="text-success">
            Active
          </Badge>
        )}
      </div>
      <div className="text-sm text-muted flex flex-col gap-2">
        <div>
          Copilot Plus takes your Obsidian experience to the next level with cutting-edge AI
          capabilities. This premium tier unlocks advanced features. Some features previously tied
          to a license key are now determined by other configurations (e.g., Brave Search API Key
          for web search).
        </div>
        <div>
          Currently in beta, Copilot Plus is evolving fast, with new features and improvements
          rolling out regularly. Join now to secure the lowest price and get early access!
        </div>
      </div>
      <div className="flex items-center gap-2">
        {/* PasswordInput for license key is removed as plusLicenseKey is removed from settings */}
        {/* The "Apply" button's main purpose was to validate and save the license key. */}
        {/* Now, Plus status is checked via checkIsPlusUser, which might depend on other settings like braveSearchApiKey. */}
        {/* We can keep a button to manually re-check/refresh the Plus status if needed, or simplify further. */}
        {!isPlusUser && (
          <Button
            disabled={isChecking}
            onClick={async () => {
              // updateSetting("plusLicenseKey", localLicenseKey); // Removed
              setIsChecking(true);
              const result = await checkIsPlusUser(); // This will update isPlusUser based on braveSearchApiKey
              setIsChecking(false);
              if (!result) {
                setError(
                  "Plus features could not be activated. Ensure Brave Search API key is set for web search features."
                );
              } else {
                setError(null);
                // new CopilotPlusWelcomeModal(app).open(); // Welcome modal might still be relevant
              }
            }}
            className="min-w-20"
          >
            {isChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh Status"}
          </Button>
        )}
        <Button variant="secondary" onClick={() => navigateToPlusPage(PLUS_UTM_MEDIUMS.SETTINGS)}>
          Learn More <ExternalLink className="size-4" />{" "}
          {/* Changed from "Join Now" to "Learn More" */}
        </Button>
      </div>
      <div className="text-error">{error}</div>
      {isPlusUser && (
        <div className="text-sm text-muted">
          Plus features (like web search via Brave) are active based on your API key configurations.
        </div>
      )}
      {!isPlusUser && !isChecking && (
        <div className="text-sm text-muted">
          To enable Plus features like web search, configure your Brave Search API key in the API
          Keys section.
        </div>
      )}
    </section>
  );
}
