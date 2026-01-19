/**
 * Hook for CLI detection
 */

import { useEffect, useState } from "react";
import type { CLIProviderName } from "../types/cli.js";
import { getCLIStatus } from "../utils/executeTask.js";

interface CLIState {
  available: boolean;
  provider: CLIProviderName | null;
  version?: string;
  loading: boolean;
}

export function useCLI(): CLIState {
  const [state, setState] = useState<CLIState>({
    available: false,
    provider: null,
    loading: true,
  });

  useEffect(() => {
    getCLIStatus().then((status) => {
      setState({
        available: status.available,
        provider: status.provider,
        version: status.version,
        loading: false,
      });
    });
  }, []);

  return state;
}
