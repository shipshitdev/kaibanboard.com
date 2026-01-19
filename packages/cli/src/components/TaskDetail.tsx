/**
 * Task detail modal component for CLI TUI
 */

import type { Task } from "@kaibanboard/core";
import { TASK_STATUSES } from "@kaibanboard/core";
import { Box, Text } from "ink";
import { getPriorityColor, getStatusColor } from "../utils/colors.js";

interface TaskDetailProps {
  task: Task;
}

export function TaskDetail({ task }: TaskDetailProps) {
  const statusColor = getStatusColor(task.status);
  const priorityColor = getPriorityColor(task.priority);

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
      width={70}
    >
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Task Detail
        </Text>
      </Box>

      <Box flexDirection="column" gap={0}>
        <Box>
          <Text bold>Title: </Text>
          <Text>{task.label}</Text>
        </Box>

        <Box>
          <Text bold>ID: </Text>
          <Text color="gray">{task.id}</Text>
        </Box>

        <Box>
          <Text bold>Status: </Text>
          <Text color={statusColor}>{task.status}</Text>
        </Box>

        <Box>
          <Text bold>Priority: </Text>
          <Text color={priorityColor}>{task.priority}</Text>
        </Box>

        <Box>
          <Text bold>Type: </Text>
          <Text>{task.type}</Text>
        </Box>

        {task.description && (
          <Box marginTop={1}>
            <Text bold>Description: </Text>
            <Text>{task.description}</Text>
          </Box>
        )}

        {task.rejectionCount > 0 && (
          <Box marginTop={1}>
            <Text bold color="red">
              Rejections: {task.rejectionCount}
            </Text>
          </Box>
        )}

        {task.agentNotes && (
          <Box marginTop={1}>
            <Text bold>Agent Notes: </Text>
            <Text color="gray">{task.agentNotes}</Text>
          </Box>
        )}
      </Box>

      <Box marginTop={2} flexDirection="column">
        <Text bold>Change Status:</Text>
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {TASK_STATUSES.map((status, index) => (
            <Text key={status}>
              <Text color="yellow">{index + 1}</Text>
              <Text color={getStatusColor(status)}>
                {" "}
                {status}
                {status === task.status ? " ●" : ""}
              </Text>
            </Text>
          ))}
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color="gray">Press </Text>
        <Text color="green">e</Text>
        <Text color="gray"> to execute, </Text>
        <Text color="red">q</Text>
        <Text color="gray"> or </Text>
        <Text color="red">Esc</Text>
        <Text color="gray"> to close</Text>
      </Box>
    </Box>
  );
}
