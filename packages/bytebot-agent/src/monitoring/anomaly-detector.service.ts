import { Injectable, Logger } from '@nestjs/common';
import { PerformanceMetrics } from './performance-monitor.service';

export interface Anomaly {
  id: string;
  type: 'performance' | 'behavior' | 'error_pattern' | 'resource_usage';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  detectedAt: Date;
  metrics: any;
  suggestedActions: string[];
  taskId?: string;
}

export interface AnomalyThresholds {
  durationMultiplier: number; // How many times above average is anomalous
  tokenUsageMultiplier: number;
  memoryUsageThreshold: number; // Absolute threshold in bytes
  cpuUsageThreshold: number; // Percentage
  errorRateThreshold: number; // Percentage
}

@Injectable()
export class AnomalyDetectorService {
  private readonly logger = new Logger(AnomalyDetectorService.name);
  private detectedAnomalies: Anomaly[] = [];
  private performanceBaseline = new Map<string, {
    avgDuration: number;
    avgTokenUsage: number;
    avgMemoryUsage: number;
    sampleCount: number;
    lastUpdated: Date;
  }>();

  private readonly defaultThresholds: AnomalyThresholds = {
    durationMultiplier: 3.0, // 3x slower than baseline
    tokenUsageMultiplier: 2.5, // 2.5x more tokens than baseline
    memoryUsageThreshold: 1024 * 1024 * 1024, // 1GB
    cpuUsageThreshold: 90, // 90%
    errorRateThreshold: 25 // 25%
  };

  /**
   * Analyze metrics for anomalies
   */
  analyzeMetrics(metrics: PerformanceMetrics, thresholds: Partial<AnomalyThresholds> = {}): Anomaly[] {
    const activeThresholds = { ...this.defaultThresholds, ...thresholds };
    const anomalies: Anomaly[] = [];

    // Update baseline for this task pattern
    this.updateBaseline(metrics);

    // Get baseline for comparison
    const baseline = this.getTaskBaseline(metrics.taskId);

    // Duration anomaly detection
    if (baseline && metrics.duration > baseline.avgDuration * activeThresholds.durationMultiplier) {
      anomalies.push({
        id: `duration_anomaly_${Date.now()}`,
        type: 'performance',
        severity: this.calculateSeverity(metrics.duration / baseline.avgDuration, activeThresholds.durationMultiplier),
        description: `Task iteration took ${Math.round(metrics.duration / 1000)}s, ${Math.round(metrics.duration / baseline.avgDuration)}x longer than baseline (${Math.round(baseline.avgDuration / 1000)}s)`,
        detectedAt: new Date(),
        metrics: { actual: metrics.duration, baseline: baseline.avgDuration, multiplier: metrics.duration / baseline.avgDuration },
        suggestedActions: [
          'Check for network latency issues',
          'Review recent changes to task logic',
          'Consider task complexity assessment'
        ],
        taskId: metrics.taskId
      });
    }

    // Token usage anomaly
    if (baseline && metrics.tokenUsage > baseline.avgTokenUsage * activeThresholds.tokenUsageMultiplier) {
      anomalies.push({
        id: `token_anomaly_${Date.now()}`,
        type: 'performance',
        severity: this.calculateSeverity(metrics.tokenUsage / baseline.avgTokenUsage, activeThresholds.tokenUsageMultiplier),
        description: `Task used ${metrics.tokenUsage} tokens, ${Math.round(metrics.tokenUsage / baseline.avgTokenUsage)}x more than baseline (${baseline.avgTokenUsage})`,
        detectedAt: new Date(),
        metrics: { actual: metrics.tokenUsage, baseline: baseline.avgTokenUsage, multiplier: metrics.tokenUsage / baseline.avgTokenUsage },
        suggestedActions: [
          'Check for context window bloat',
          'Review summarization effectiveness',
          'Investigate prompt optimization opportunities'
        ],
        taskId: metrics.taskId
      });
    }

    // Memory usage anomaly
    if (metrics.memoryUsage > activeThresholds.memoryUsageThreshold) {
      anomalies.push({
        id: `memory_anomaly_${Date.now()}`,
        type: 'resource_usage',
        severity: metrics.memoryUsage > activeThresholds.memoryUsageThreshold * 1.5 ? 'critical' : 'high',
        description: `Excessive memory usage: ${Math.round(metrics.memoryUsage / 1024 / 1024)}MB (threshold: ${Math.round(activeThresholds.memoryUsageThreshold / 1024 / 1024)}MB)`,
        detectedAt: new Date(),
        metrics: { actual: metrics.memoryUsage, threshold: activeThresholds.memoryUsageThreshold },
        suggestedActions: [
          'Implement immediate garbage collection',
          'Clear message history',
          'Check for memory leaks',
          'Consider task restart'
        ],
        taskId: metrics.taskId
      });
    }

    // CPU usage anomaly
    if (metrics.cpuUsage > activeThresholds.cpuUsageThreshold) {
      anomalies.push({
        id: `cpu_anomaly_${Date.now()}`,
        type: 'resource_usage',
        severity: metrics.cpuUsage > 95 ? 'critical' : 'high',
        description: `High CPU usage: ${metrics.cpuUsage}% (threshold: ${activeThresholds.cpuUsageThreshold}%)`,
        detectedAt: new Date(),
        metrics: { actual: metrics.cpuUsage, threshold: activeThresholds.cpuUsageThreshold },
        suggestedActions: [
          'Check for infinite loops',
          'Review computational complexity',
          'Consider task throttling',
          'Monitor system load'
        ],
        taskId: metrics.taskId
      });
    }

    // Store detected anomalies
    this.detectedAnomalies.push(...anomalies);
    
    // Keep only recent anomalies (last 24 hours)
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    this.detectedAnomalies = this.detectedAnomalies.filter(a => a.detectedAt >= cutoff);

    if (anomalies.length > 0) {
      this.logger.warn(`Detected ${anomalies.length} anomalies for task ${metrics.taskId}`);
    }

    return anomalies;
  }

  /**
   * Detect behavioral anomalies in task patterns
   */
  detectBehaviorAnomalies(taskId: string, actions: string[]): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // Detect repetitive action patterns (potential infinite loops)
    const actionCounts = new Map<string, number>();
    for (const action of actions) {
      actionCounts.set(action, (actionCounts.get(action) || 0) + 1);
    }

    for (const [action, count] of actionCounts) {
      if (count > 10 && count / actions.length > 0.5) { // More than 50% of actions are the same
        anomalies.push({
          id: `behavior_anomaly_${Date.now()}`,
          type: 'behavior',
          severity: count > 20 ? 'high' : 'medium',
          description: `Repetitive action pattern detected: "${action}" repeated ${count} times (${Math.round(count / actions.length * 100)}% of actions)`,
          detectedAt: new Date(),
          metrics: { action, count, percentage: count / actions.length },
          suggestedActions: [
            'Check for infinite loops in task logic',
            'Review task completion conditions',
            'Consider adding variation detection',
            'Implement action pattern monitoring'
          ],
          taskId
        });
      }
    }

    // Detect unusual action sequences
    if (actions.length > 50) {
      anomalies.push({
        id: `sequence_anomaly_${Date.now()}`,
        type: 'behavior',
        severity: 'medium',
        description: `Unusually long action sequence: ${actions.length} actions in single task`,
        detectedAt: new Date(),
        metrics: { actionCount: actions.length },
        suggestedActions: [
          'Review task complexity',
          'Consider breaking into subtasks',
          'Check for task goal clarity',
          'Implement progress checkpoints'
        ],
        taskId
      });
    }

    this.detectedAnomalies.push(...anomalies);
    return anomalies;
  }

  /**
   * Get recent anomalies
   */
  getRecentAnomalies(hours: number = 24): Anomaly[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.detectedAnomalies.filter(a => a.detectedAt >= cutoff);
  }

  /**
   * Get anomaly statistics
   */
  getAnomalyStats(hours: number = 24) {
    const recent = this.getRecentAnomalies(hours);
    
    const byType = new Map<string, number>();
    const bySeverity = new Map<string, number>();
    
    for (const anomaly of recent) {
      byType.set(anomaly.type, (byType.get(anomaly.type) || 0) + 1);
      bySeverity.set(anomaly.severity, (bySeverity.get(anomaly.severity) || 0) + 1);
    }

    return {
      total: recent.length,
      byType: Object.fromEntries(byType),
      bySeverity: Object.fromEntries(bySeverity),
      affectedTasks: new Set(recent.filter(a => a.taskId).map(a => a.taskId!)).size
    };
  }

  /**
   * Clear resolved anomalies
   */
  clearAnomalies(taskId?: string): number {
    const initialLength = this.detectedAnomalies.length;
    
    if (taskId) {
      this.detectedAnomalies = this.detectedAnomalies.filter(a => a.taskId !== taskId);
    } else {
      this.detectedAnomalies = [];
    }

    const cleared = initialLength - this.detectedAnomalies.length;
    if (cleared > 0) {
      this.logger.log(`Cleared ${cleared} anomalies${taskId ? ` for task ${taskId}` : ''}`);
    }

    return cleared;
  }

  private updateBaseline(metrics: PerformanceMetrics): void {
    const key = this.getTaskPattern(metrics.taskId);
    const existing = this.performanceBaseline.get(key);

    if (existing) {
      // Update moving average
      const newCount = existing.sampleCount + 1;
      existing.avgDuration = (existing.avgDuration * existing.sampleCount + metrics.duration) / newCount;
      existing.avgTokenUsage = (existing.avgTokenUsage * existing.sampleCount + metrics.tokenUsage) / newCount;
      existing.avgMemoryUsage = (existing.avgMemoryUsage * existing.sampleCount + metrics.memoryUsage) / newCount;
      existing.sampleCount = Math.min(newCount, 100); // Cap at 100 samples for moving average
      existing.lastUpdated = new Date();
    } else {
      // Create new baseline
      this.performanceBaseline.set(key, {
        avgDuration: metrics.duration,
        avgTokenUsage: metrics.tokenUsage,
        avgMemoryUsage: metrics.memoryUsage,
        sampleCount: 1,
        lastUpdated: new Date()
      });
    }
  }

  private getTaskBaseline(taskId: string) {
    const key = this.getTaskPattern(taskId);
    return this.performanceBaseline.get(key);
  }

  private getTaskPattern(taskId: string): string {
    // Simple pattern extraction - could be enhanced with NLP
    return 'default'; // For now, use single baseline
  }

  private calculateSeverity(actual: number, threshold: number): 'low' | 'medium' | 'high' | 'critical' {
    const ratio = actual / threshold;
    
    if (ratio >= 5) return 'critical';
    if (ratio >= 3) return 'high';
    if (ratio >= 2) return 'medium';
    return 'low';
  }
}