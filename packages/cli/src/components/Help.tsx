/**
 * Help screen component for CLI TUI
 */

import { Box, Text } from "ink";

export function Help() {
  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="magenta"
      paddingX={2}
      paddingY={1}
      width={60}
    >
      <Box marginBottom={1}>
        <Text bold color="magenta">
          Kaiban Board - Help
        </Text>
      </Box>

      <Box flexDirection="column" gap={0}>
        <Text bold color="cyan">
          Navigation
        </Text>
        <Text>
          {"  "}← / h {"    "} Previous column
        </Text>
        <Text>
          {"  "}→ / l {"    "} Next column
        </Text>
        <Text>
          {"  "}↑ / k {"    "} Previous task
        </Text>
        <Text>
          {"  "}↓ / j {"    "} Next task
        </Text>

        <Box marginTop={1}>
          <Text bold color="cyan">
            Actions
          </Text>
        </Box>
        <Text>
          {"  "}Enter {"    "} View task detail
        </Text>
        <Text>
          {"  "}e {"        "} Execute task with CLI
        </Text>
        <Text>
          {"  "}1-6 {"      "} Quick status change
        </Text>
        <Text>
          {"  "}r {"        "} Refresh board
        </Text>

        <Box marginTop={1}>
          <Text bold color="cyan">
            Status Keys
          </Text>
        </Box>
        <Text>
          {"  "}
          <Text color="yellow">1</Text> Backlog {"  "}
          <Text color="yellow">2</Text> To Do {"  "}
          <Text color="yellow">3</Text> Doing
        </Text>
        <Text>
          {"  "}
          <Text color="yellow">4</Text> Testing {"  "}
          <Text color="yellow">5</Text> Done {"   "}
          <Text color="yellow">6</Text> Blocked
        </Text>

        <Box marginTop={1}>
          <Text bold color="cyan">
            General
          </Text>
        </Box>
        <Text>
          {"  "}? {"        "} Show this help
        </Text>
        <Text>
          {"  "}q {"        "} Quit
        </Text>
      </Box>

      <Box marginTop={2}>
        <Text color="gray">Press </Text>
        <Text color="magenta">?</Text>
        <Text color="gray"> or </Text>
        <Text color="red">q</Text>
        <Text color="gray"> or </Text>
        <Text color="red">Esc</Text>
        <Text color="gray"> to close</Text>
      </Box>
    </Box>
  );
}
