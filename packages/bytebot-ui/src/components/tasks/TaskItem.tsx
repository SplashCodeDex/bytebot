import React from "react";
import { Task, TaskStatus } from "@/types";
import { format } from "date-fns";
import { capitalizeFirstChar } from "@/utils/stringUtils";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Tick02Icon,
  CancelCircleIcon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import { Loader } from "@/components/ui/loader";
import Link from "next/link";

interface TaskItemProps {
  task: Task;
}

interface StatusIconConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: any; // HugeIcons IconSvgObject type
  color?: string;
  useLoader?: boolean;
}

const STATUS_CONFIGS: Record<TaskStatus, StatusIconConfig> = {
  [TaskStatus.COMPLETED]: {
    icon: Tick02Icon,
    color: "text-bytebot-green-8",
  },
  [TaskStatus.RUNNING]: {
    useLoader: true,
  },
  [TaskStatus.NEEDS_HELP]: {
    icon: AlertCircleIcon,
    color: "text-[#FF9D00]",
  },
  [TaskStatus.PENDING]: {
    useLoader: true,
  },
  [TaskStatus.FAILED]: {
    icon: AlertCircleIcon,
    color: "text-bytebot-red-light-9",
  },
  [TaskStatus.NEEDS_REVIEW]: {
    icon: AlertCircleIcon,
    color: "text-[#FF9D00]",
  },
  [TaskStatus.CANCELLED]: {
    icon: CancelCircleIcon,
    color: "text-bytebot-bronze-light-10",
  },
};

export const TaskItem: React.FC<TaskItemProps> = ({ task }) => {
  // Format date to match the screenshot (e.g., "Today 9:13am" or "April 13, 2025, 12:01pm")
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();

    const isToday =
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();

    const formatString = isToday ? `'Today' h:mma` : "MMMM d, yyyy h:mma";

    const formatted = format(date, formatString).toLowerCase();
    return capitalizeFirstChar(formatted);
  };

  const StatusIcon = ({ status }: { status: TaskStatus }) => {
    const config = STATUS_CONFIGS[status];
    if (!config) return null;

    const { icon, color, useLoader } = config;

    if (useLoader) {
      return (
        <div className="flex items-center justify-center">
          <Loader size={16} />
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center">
        <HugeiconsIcon icon={icon} className={`h-5 w-5 ${color}`} />
      </div>
    );
  };

  return (
    <Link href={`/tasks/${task.id}`} className="block">
      <div className="bg-bytebot-bronze-light-2 border-bytebot-bronze-light-7 hover:bg-bytebot-bronze-light-3 flex min-h-24 items-start rounded-lg border p-5 transition-colors">
        <div className="mb-0.5 flex-1 space-y-2">
          <div className="flex items-center justify-start space-x-2">
            <StatusIcon status={task.status} />
            <div className="text-byhtebot-bronze-dark-7 text-sm font-medium">
              {capitalizeFirstChar(task.description)}
            </div>
          </div>
          <div className="ml-7 flex items-center justify-start space-x-1.5 text-xs">
            <span className="text-bytebot-bronze-light-10">
              {formatDate(task.createdAt)}
            </span>
            {task.error && (
              <div className="mt-2 max-w-md">
                <div className={`text-xs px-2 py-1 rounded ${
                  task.status === TaskStatus.NEEDS_HELP 
                    ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {task.error.includes('quota') || task.error.includes('API') ? (
                    <div>
                      <strong>API Quota Issue:</strong> {task.error}
                      {task.error.includes('quota') && (
                        <div className="mt-1 text-xs text-amber-600">
                          💡 <strong>Quick fixes:</strong>
                          <ul className="mt-1 ml-2 list-disc list-inside">
                            <li>Check your AI provider billing</li>
                            <li>Wait for quota reset</li>
                            <li>Add backup API keys</li>
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : task.error.includes('rate limit') ? (
                    <div>
                      <strong>Rate Limited:</strong> {task.error}
                      <div className="mt-1 text-xs text-amber-600">
                        💡 Try again in a few minutes
                      </div>
                    </div>
                  ) : (
                    task.error
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
};
