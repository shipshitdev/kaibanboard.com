/**
 * Status bar component for CLI TUI
 */

import { Box, Text } from "ink";
import type { CLIProviderName } from "../types/cli.js";

interface StatusBarProps {
  cliProvider: CLIProviderName | null;
  cliVersion?: string;
  cliLoading: boolean;
  mode: "board" | "detail" | "help" | "confirm";
}

export function StatusBar({ cliProvider, cliVersion, cliLoading, mode }: StatusBarProps) {
  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
    >
      <Box>
        {mode === "board" && (
          <Text>
            <Text color="gray">←→</Text> Columns{"  "}
            <Text color="gray">↑↓</Text> Tasks{"  "}
            <Text color="cyan">Enter</Text> Detail{"  "}
            <Text color="green">e</Text> Execute{"  "}
            <Text color="yellow">1-6</Text> Status{"  "}
            <Text color="magenta">r</Text> Refresh{"  "}
            <Text color="gray">?</Text> Help{"  "}
            <Text color="red">q</Text> Quit
          </Text>
        )}
        {mode === "detail" && (
          <Text>
            <Text color="yellow">1-6</Text> Change Status{"  "}
            <Text color="green">e</Text> Execute{"  "}
            <Text color="red">q/Esc</Text> Close
          </Text>
        )}
        {mode === "help" && (
          <Text>
            <Text color="red">q/Esc/?</Text> Close Help
          </Text>
        )}
        {mode === "confirm" && (
          <Text>
            <Text color="green">y</Text> Yes{"  "}
            <Text color="red">n/Esc</Text> No
          </Text>
        )}
      </Box>

      <Box>
        {cliLoading ? (
          <Text color="yellow">Detecting CLI...</Text>
        ) : cliProvider ? (
          <Text>
            <Text color="green">✓</Text> <Text>{cliProvider}</Text>
            {cliVersion && <Text color="gray"> v{cliVersion}</Text>}
          </Text>
        ) : (
          <Text color="red">✗ No CLI</Text>
        )}
      </Box>
    </Box>
  );
}
