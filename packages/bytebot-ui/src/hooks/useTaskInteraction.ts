import { useState, useEffect, useCallback } from "react";
import { TaskStatus, Role } from "@/types";

interface TaskInteractionState {
  canInteract: boolean;
  isWaitingForResponse: boolean;
  interactionType: "question" | "clarification" | "general" | "none";
  suggestedResponses: string[];
}

interface UseTaskInteractionProps {
  taskStatus: TaskStatus;
  control: Role;
  lastMessage?: string;
}

export function useTaskInteraction({ taskStatus, control, lastMessage }: UseTaskInteractionProps) {
  const [interactionState, setInteractionState] = useState<TaskInteractionState>({
    canInteract: false,
    isWaitingForResponse: false,
    interactionType: "none",
    suggestedResponses: []
  });

  // Determine interaction capability based on task state
  const updateInteractionState = useCallback(() => {
    let canInteract = false;
    let isWaitingForResponse = false;
    let interactionType: TaskInteractionState["interactionType"] = "none";
    let suggestedResponses: string[] = [];

    // User can interact during running states and when AI needs help
    if ([TaskStatus.RUNNING, TaskStatus.NEEDS_HELP, TaskStatus.PENDING].includes(taskStatus)) {
      canInteract = true;

      if (taskStatus === TaskStatus.NEEDS_HELP) {
        isWaitingForResponse = true;
        interactionType = "question";
        suggestedResponses = [
          "Yes, proceed",
          "No, try a different approach", 
          "Let me provide more details",
          "I need to check something first"
        ];
      } else if (taskStatus === TaskStatus.RUNNING) {
        interactionType = "general";
        suggestedResponses = [
          "That looks correct",
          "Please wait",
          "Try a different approach",
          "Stop the current action"
        ];
      } else if (taskStatus === TaskStatus.PENDING) {
        interactionType = "clarification";
        suggestedResponses = [
          "Start the task",
          "I need to add more details",
          "Cancel this task"
        ];
      }
    }

    setInteractionState({
      canInteract,
      isWaitingForResponse,
      interactionType,
      suggestedResponses
    });
  }, [taskStatus, control, lastMessage]);

  useEffect(() => {
    updateInteractionState();
  }, [updateInteractionState]);

  // Helper to get appropriate placeholder text
  const getPlaceholder = useCallback(() => {
    switch (interactionState.interactionType) {
      case "question":
        return "Answer the AI's question or provide additional information...";
      case "general":
        return "Add more details or ask questions while AI is working...";
      case "clarification":
        return "Add more details to your task...";
      default:
        return "Type your message...";
    }
  }, [interactionState.interactionType]);

  // Helper to get interaction status message
  const getStatusMessage = useCallback(() => {
    if (interactionState.isWaitingForResponse) {
      return "AI is waiting for your response";
    }
    if (interactionState.canInteract && taskStatus === TaskStatus.RUNNING) {
      return "You can interact with the AI while it works";
    }
    return null;
  }, [interactionState, taskStatus]);

  return {
    ...interactionState,
    getPlaceholder,
    getStatusMessage
  };
}