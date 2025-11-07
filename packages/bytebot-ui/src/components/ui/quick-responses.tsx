import React from "react";
import { Button } from "@/components/ui/button";
import { TaskStatus } from "@/types";

interface QuickResponsesProps {
  taskStatus: TaskStatus;
  onResponseSelect: (response: string) => void;
  isLoading?: boolean;
}

const QUICK_RESPONSES = {
  [TaskStatus.NEEDS_HELP]: [
    "Yes, proceed",
    "No, try a different approach",
    "Let me provide more details",
    "I need to check something first"
  ],
  [TaskStatus.RUNNING]: [
    "That looks correct",
    "Please wait",
    "Try a different approach", 
    "Stop the current action"
  ],
  [TaskStatus.PENDING]: [
    "Start the task",
    "I need to add more details",
    "Cancel this task"
  ]
};

export function QuickResponses({ taskStatus, onResponseSelect, isLoading = false }: QuickResponsesProps) {
  const responses = QUICK_RESPONSES[taskStatus] || [];

  if (responses.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 mb-2">
      <span className="text-xs text-bytebot-bronze-light-11 self-center mr-2">
        Quick responses:
      </span>
      {responses.map((response, index) => (
        <Button
          key={index}
          variant="outline"
          size="sm"
          onClick={() => onResponseSelect(response)}
          disabled={isLoading}
          className="text-xs h-7 px-3 bg-bytebot-bronze-light-1 hover:bg-bytebot-bronze-light-2 border-bytebot-bronze-light-6"
        >
          {response}
        </Button>
      ))}
    </div>
  );
}