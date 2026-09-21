import { executeActions } from "../automation/execute-actions.js";

export type NotificationDispatchJobData = {
  executionId: string;
};

/** Processes one queued "send the actions for this execution" job. */
export async function processNotificationDispatchJob(data: NotificationDispatchJobData) {
  return executeActions(data.executionId);
}
