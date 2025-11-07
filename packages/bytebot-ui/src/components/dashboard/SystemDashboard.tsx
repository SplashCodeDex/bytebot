'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '../ui/card';

interface SystemMetrics {
  agentPool: {
    totalAgents: number;
    activeAgents: number;
    availableAgents: number;
    queuedTasks: number;
    averageSuccessRate: number;
  };
  performance: {
    averageTaskDuration: number;
    averageTokenUsage: number;
    taskThroughput: number;
    memoryUsage: number;
  };
  anomalies: {
    total: number;
    bySeverity: Record<string, number>;
    recent: Array<{
      type: string;
      severity: string;
      description: string;
      taskId?: string;
    }>;
  };
  patterns: {
    totalPatterns: number;
    automationOpportunities: number;
    recentInsights: Array<{
      type: string;
      description: string;
      confidence: number;
    }>;
  };
}

interface SystemDashboardProps {
  className?: string;
}

export function SystemDashboard({ className = '' }: SystemDashboardProps) {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // In a real implementation, this would fetch from the backend API
    // For now, we'll use mock data
    const fetchMetrics = async () => {
      try {
        setLoading(true);
        
        // Mock data - replace with actual API call
        const mockMetrics: SystemMetrics = {
          agentPool: {
            totalAgents: 3,
            activeAgents: 2,
            availableAgents: 1,
            queuedTasks: 5,
            averageSuccessRate: 0.92
          },
          performance: {
            averageTaskDuration: 45000, // 45 seconds
            averageTokenUsage: 25000,
            taskThroughput: 12, // tasks per hour
            memoryUsage: 512 // MB
          },
          anomalies: {
            total: 3,
            bySeverity: { low: 1, medium: 2, high: 0, critical: 0 },
            recent: [
              {
                type: 'performance',
                severity: 'medium',
                description: 'Task duration 2x above baseline',
                taskId: 'task_123'
              },
              {
                type: 'resource_usage',
                severity: 'low',
                description: 'Memory usage slightly elevated',
                taskId: 'task_456'
              }
            ]
          },
          patterns: {
            totalPatterns: 15,
            automationOpportunities: 3,
            recentInsights: [
              {
                type: 'workflow_optimization',
                description: 'Email processing pattern detected 8 times',
                confidence: 0.85
              },
              {
                type: 'timing_optimization',
                description: 'Tasks 20% faster during 9-11 AM',
                confidence: 0.73
              }
            ]
          }
        };

        setMetrics(mockMetrics);
        setError(null);
      } catch (err) {
        setError('Failed to load system metrics');
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <DashboardSkeleton className={className} />;
  if (error) return <DashboardError error={error} className={className} />;
  if (!metrics) return null;

  return (
    <div className={`space-y-6 ${className}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">System Dashboard</h2>
        <div className="text-sm text-gray-500">
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </div>

      {/* Agent Pool Status */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Agent Pool Status</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            label="Total Agents"
            value={metrics.agentPool.totalAgents}
            icon="🤖"
          />
          <MetricCard
            label="Active"
            value={metrics.agentPool.activeAgents}
            icon="🟢"
            color="text-green-600"
          />
          <MetricCard
            label="Available"
            value={metrics.agentPool.availableAgents}
            icon="⚪"
            color="text-blue-600"
          />
          <MetricCard
            label="Queued Tasks"
            value={metrics.agentPool.queuedTasks}
            icon="📋"
            color={metrics.agentPool.queuedTasks > 10 ? "text-red-600" : "text-gray-600"}
          />
        </div>
        
        <div className="mt-4">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Success Rate</span>
            <span>{Math.round(metrics.agentPool.averageSuccessRate * 100)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-green-600 h-2 rounded-full"
              style={{ width: `${metrics.agentPool.averageSuccessRate * 100}%` }}
            ></div>
          </div>
        </div>
      </Card>

      {/* Performance Metrics */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Performance Metrics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            label="Avg Duration"
            value={`${Math.round(metrics.performance.averageTaskDuration / 1000)}s`}
            icon="⏱️"
          />
          <MetricCard
            label="Avg Tokens"
            value={`${Math.round(metrics.performance.averageTokenUsage / 1000)}K`}
            icon="🔤"
          />
          <MetricCard
            label="Throughput"
            value={`${metrics.performance.taskThroughput}/h`}
            icon="🚀"
          />
          <MetricCard
            label="Memory"
            value={`${metrics.performance.memoryUsage}MB`}
            icon="💾"
            color={metrics.performance.memoryUsage > 800 ? "text-red-600" : "text-gray-600"}
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Anomalies */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">
            Anomalies ({metrics.anomalies.total})
          </h3>
          
          <div className="space-y-3">
            {metrics.anomalies.recent.map((anomaly, index) => (
              <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                <div className={`w-2 h-2 rounded-full mt-2 ${getSeverityColor(anomaly.severity)}`}></div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">
                    {anomaly.type.replace('_', ' ')}
                  </div>
                  <div className="text-sm text-gray-600">{anomaly.description}</div>
                  {anomaly.taskId && (
                    <div className="text-xs text-gray-500 mt-1">Task: {anomaly.taskId}</div>
                  )}
                </div>
                <div className={`text-xs px-2 py-1 rounded capitalize ${getSeverityBadgeColor(anomaly.severity)}`}>
                  {anomaly.severity}
                </div>
              </div>
            ))}
            
            {metrics.anomalies.recent.length === 0 && (
              <div className="text-center text-gray-500 py-4">
                No recent anomalies detected
              </div>
            )}
          </div>
        </Card>

        {/* Pattern Insights */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">
            Pattern Insights ({metrics.patterns.totalPatterns} patterns)
          </h3>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">Automation Opportunities</span>
              <span className="font-medium text-blue-600">
                {metrics.patterns.automationOpportunities}
              </span>
            </div>
            
            {metrics.patterns.recentInsights.map((insight, index) => (
              <div key={index} className="p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-medium text-blue-900">
                    {insight.type.replace('_', ' ')}
                  </div>
                  <div className="text-xs text-blue-600">
                    {Math.round(insight.confidence * 100)}% confidence
                  </div>
                </div>
                <div className="text-sm text-blue-700">{insight.description}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ 
  label, 
  value, 
  icon, 
  color = "text-gray-600" 
}: { 
  label: string; 
  value: string | number; 
  icon: string; 
  color?: string; 
}) {
  return (
    <div className="text-center">
      <div className="text-2xl mb-1">{icon}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
    </div>
  );
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'bg-red-600';
    case 'high': return 'bg-red-500';
    case 'medium': return 'bg-yellow-500';
    case 'low': return 'bg-blue-500';
    default: return 'bg-gray-500';
  }
}

function getSeverityBadgeColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'bg-red-100 text-red-800';
    case 'high': return 'bg-red-100 text-red-700';
    case 'medium': return 'bg-yellow-100 text-yellow-700';
    case 'low': return 'bg-blue-100 text-blue-700';
    default: return 'bg-gray-100 text-gray-700';
  }
}

function DashboardSkeleton({ className }: { className?: string }) {
  return (
    <div className={`space-y-6 ${className}`}>
      <div className="h-8 bg-gray-200 rounded w-48 animate-pulse"></div>
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <Card key={i} className="p-6">
            <div className="h-6 bg-gray-200 rounded w-32 mb-4 animate-pulse"></div>
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(j => (
                <div key={j} className="text-center space-y-2">
                  <div className="h-8 bg-gray-200 rounded w-8 mx-auto animate-pulse"></div>
                  <div className="h-6 bg-gray-200 rounded w-12 mx-auto animate-pulse"></div>
                  <div className="h-4 bg-gray-200 rounded w-16 mx-auto animate-pulse"></div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function DashboardError({ error, className }: { error: string; className?: string }) {
  return (
    <Card className={`p-6 ${className}`}>
      <div className="text-center text-red-600">
        <div className="text-4xl mb-2">⚠️</div>
        <div className="text-lg font-semibold">Error Loading Dashboard</div>
        <div className="text-sm mt-1">{error}</div>
      </div>
    </Card>
  );
}