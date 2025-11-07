import React from "react";
import { TaskStatus } from "@/types";
import { Card } from "@/components/ui/card";

interface InteractionPromptProps {
  taskStatus: TaskStatus;
  lastMessage?: string;
  isWaitingForResponse?: boolean;
}

export function InteractionPrompt({ taskStatus, lastMessage, isWaitingForResponse }: InteractionPromptProps) {
  if (taskStatus !== TaskStatus.NEEDS_HELP && !isWaitingForResponse) {
    return null;
  }

  const getPromptContent = () => {
    switch (taskStatus) {
      case TaskStatus.NEEDS_HELP:
        return {
          icon: "❓",
          title: "AI needs your help",
          message: "Bytebot has a question and is waiting for your response.",
          bgColor: "bg-yellow-50 border-yellow-200",
          textColor: "text-yellow-800"
        };
      default:
        return {
          icon: "💬",
          title: "You can interact",
          message: "Feel free to provide additional information or ask questions.",
          bgColor: "bg-blue-50 border-blue-200",
          textColor: "text-blue-800"
        };
    }
  };

  const prompt = getPromptContent();

  return (
    <Card className={`mx-4 mb-4 p-3 ${prompt.bgColor} border-2`}>
      <div className="flex items-center gap-3">
        <div className="text-xl">{prompt.icon}</div>
        <div className="flex-1">
          <h4 className={`font-medium text-sm ${prompt.textColor}`}>
            {prompt.title}
          </h4>
          <p className={`text-xs ${prompt.textColor} opacity-80`}>
            {prompt.message}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-current rounded-full animate-pulse"></div>
          <div className="w-2 h-2 bg-current rounded-full animate-pulse" style={{ animationDelay: "0.2s" }}></div>
          <div className="w-2 h-2 bg-current rounded-full animate-pulse" style={{ animationDelay: "0.4s" }}></div>
        </div>
      </div>
    </Card>
  );
}