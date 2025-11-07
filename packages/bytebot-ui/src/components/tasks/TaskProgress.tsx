'use client';

import React from 'react';
import { Card } from '../ui/card';

export interface TaskProgressData {
  status: string;
  iterationCount: number;
  tokenUsage: number;
  duration: number;
  memoryUsage: number;
  anomalies: number;
  estimatedCompletion?: number;
  currentStep?: string;
}

interface TaskProgressProps {
  taskId: string;
  progress: TaskProgressData;
  className?: string;
}

export function TaskProgress({ taskId, progress, className = '' }: TaskProgressProps) {
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  const formatTokens = (tokens: number) => {
    if (tokens < 1000) return tokens.toString();
    if (tokens < 1000000) return `${Math.round(tokens / 1000)}K`;
    return `${Math.round(tokens / 1000000)}M`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processing': return 'text-blue-600';
      case 'completed': return 'text-green-600';
      case 'failed': return 'text-red-600';
      case 'needs_help': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  };

  const getAnomalyColor = (count: number) => {
    if (count === 0) return 'text-green-600';
    if (count < 3) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Card className={`p-4 ${className}`}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900">Task Progress</h3>
          <span className={`text-sm font-medium capitalize ${getStatusColor(progress.status)}`}>
            {progress.status}
          </span>
        </div>

        {progress.currentStep && (
          <div className="text-sm text-gray-600">
            <span className="font-medium">Current Step:</span> {progress.currentStep}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Iterations:</span>
              <span className="font-medium">{progress.iterationCount}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Duration:</span>
              <span className="font-medium">{formatDuration(progress.duration)}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Memory:</span>
              <span className="font-medium">{progress.memoryUsage}MB</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Tokens:</span>
              <span className="font-medium">{formatTokens(progress.tokenUsage)}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600">Anomalies:</span>
              <span className={`font-medium ${getAnomalyColor(progress.anomalies)}`}>
                {progress.anomalies}
              </span>
            </div>

            {progress.estimatedCompletion && (
              <div className="flex justify-between">
                <span className="text-gray-600">ETA:</span>
                <span className="font-medium">{formatDuration(progress.estimatedCompletion)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Progress bar for token usage */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-600">
            <span>Token Usage</span>
            <span>{Math.round((progress.tokenUsage / 200000) * 100)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.min((progress.tokenUsage / 200000) * 100, 100)}%` }}
            ></div>
          </div>
        </div>

        {/* Performance indicators */}
        <div className="flex items-center space-x-4 text-xs">
          <div className="flex items-center space-x-1">
            <div className={`w-2 h-2 rounded-full ${progress.duration < 30000 ? 'bg-green-500' : progress.duration < 60000 ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
            <span className="text-gray-600">Speed</span>
          </div>
          
          <div className="flex items-center space-x-1">
            <div className={`w-2 h-2 rounded-full ${progress.memoryUsage < 256 ? 'bg-green-500' : progress.memoryUsage < 512 ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
            <span className="text-gray-600">Memory</span>
          </div>
          
          <div className="flex items-center space-x-1">
            <div className={`w-2 h-2 rounded-full ${getAnomalyColor(progress.anomalies).includes('green') ? 'bg-green-500' : getAnomalyColor(progress.anomalies).includes('yellow') ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
            <span className="text-gray-600">Health</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function TaskProgressSkeleton({ className = '' }: { className?: string }) {
  return (
    <Card className={`p-4 ${className}`}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded w-16 animate-pulse"></div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex justify-between">
                <div className="h-3 bg-gray-200 rounded w-16 animate-pulse"></div>
                <div className="h-3 bg-gray-200 rounded w-12 animate-pulse"></div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex justify-between">
                <div className="h-3 bg-gray-200 rounded w-16 animate-pulse"></div>
                <div className="h-3 bg-gray-200 rounded w-12 animate-pulse"></div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <div className="h-3 bg-gray-200 rounded w-20 animate-pulse"></div>
          <div className="w-full bg-gray-200 rounded-full h-2 animate-pulse"></div>
        </div>

        <div className="flex items-center space-x-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-gray-200 rounded-full animate-pulse"></div>
              <div className="h-3 bg-gray-200 rounded w-8 animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}