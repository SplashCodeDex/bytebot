import { Injectable, Logger } from '@nestjs/common';
import { IntelligentFileService, FileAnalysis, WorkflowSuggestion } from './intelligent-file.service';

export interface FileWorkflowPattern {
  filePattern: string;
  workflowSequence: string[];
  frequency: number;
  successRate: number;
  averageDuration: number;
  optimization: string;
  automation: {
    isAutomatable: boolean;
    automationScript?: string;
    requiredInputs: string[];
  };
}

export interface FileBasedAutomation {
  triggerId: string;
  name: string;
  description: string;
  filePatterns: string[];
  workflow: string[];
  confidence: number;
  estimatedTimeSavings: number;
}

@Injectable()
export class FilePatternRecognitionService {
  private readonly logger = new Logger(FilePatternRecognitionService.name);
  private fileWorkflows: Array<{
    fileId: string;
    category: string;
    workflow: string[];
    success: boolean;
    duration: number;
    timestamp: Date;
  }> = [];

  constructor(private readonly intelligentFileService: IntelligentFileService) {}

  /**
   * Analyze file-based workflow patterns
   */
  async analyzeFileWorkflowPatterns(): Promise<FileWorkflowPattern[]> {
    this.logger.log('Analyzing file workflow patterns');

    const patterns = new Map<string, {
      workflows: Array<{ sequence: string[]; success: boolean; duration: number }>;
    }>();

    // Group workflows by file pattern
    for (const workflow of this.fileWorkflows) {
      const pattern = this.getFilePattern(workflow.category);
      
      if (!patterns.has(pattern)) {
        patterns.set(pattern, { workflows: [] });
      }

      patterns.get(pattern)!.workflows.push({
        sequence: workflow.workflow,
        success: workflow.success,
        duration: workflow.duration
      });
    }

    // Analyze each pattern
    const filePatterns: FileWorkflowPattern[] = [];

    for (const [filePattern, data] of patterns) {
      if (data.workflows.length < 3) continue; // Need minimum data

      const workflowSequences = this.findCommonWorkflowSequences(data.workflows);
      
      for (const sequence of workflowSequences) {
        const pattern = await this.analyzeWorkflowSequence(filePattern, sequence, data.workflows);
        filePatterns.push(pattern);
      }
    }

    return filePatterns.sort((a, b) => (b.frequency * b.successRate) - (a.frequency * a.successRate));
  }

  /**
   * Suggest file-based automations
   */
  async suggestFileBasedAutomations(): Promise<FileBasedAutomation[]> {
    const patterns = await this.analyzeFileWorkflowPatterns();
    const automations: FileBasedAutomation[] = [];

    for (const pattern of patterns) {
      if (pattern.frequency >= 5 && 
          pattern.successRate > 0.8 && 
          pattern.automation.isAutomatable) {
        
        const automation: FileBasedAutomation = {
          triggerId: `file_auto_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          name: `Auto-process ${pattern.filePattern} files`,
          description: `Automatically execute ${pattern.workflowSequence.join(' → ')} when ${pattern.filePattern} files are uploaded`,
          filePatterns: [pattern.filePattern],
          workflow: pattern.workflowSequence,
          confidence: pattern.successRate * Math.min(pattern.frequency / 10, 1),
          estimatedTimeSavings: pattern.averageDuration * pattern.frequency * 0.8
        };

        automations.push(automation);
      }
    }

    return automations.sort((a, b) => (b.confidence * b.estimatedTimeSavings) - (a.confidence * a.estimatedTimeSavings));
  }

  /**
   * Record file workflow execution
   */
  recordFileWorkflow(
    fileId: string,
    category: string,
    workflow: string[],
    success: boolean,
    duration: number
  ): void {
    this.fileWorkflows.push({
      fileId,
      category,
      workflow,
      success,
      duration,
      timestamp: new Date()
    });

    // Keep only recent workflows (last 500)
    if (this.fileWorkflows.length > 500) {
      this.fileWorkflows = this.fileWorkflows.slice(-500);
    }

    this.logger.debug(`Recorded file workflow: ${category} → ${workflow.join(' → ')}`);
  }

  /**
   * Get smart file processing suggestions for new uploads
   */
  async getSmartProcessingSuggestions(fileAnalysis: FileAnalysis): Promise<WorkflowSuggestion[]> {
    const pattern = this.getFilePattern(fileAnalysis.category.primary);
    const historicalWorkflows = this.fileWorkflows.filter(w => 
      this.getFilePattern(w.category) === pattern && w.success
    );

    if (historicalWorkflows.length === 0) {
      return fileAnalysis.suggestedWorkflows;
    }

    // Enhance suggestions with historical data
    const enhancedSuggestions: WorkflowSuggestion[] = [];
    const workflowFrequency = new Map<string, { count: number; avgDuration: number; successRate: number }>();

    // Calculate workflow statistics
    for (const workflow of historicalWorkflows) {
      for (const step of workflow.workflow) {
        if (!workflowFrequency.has(step)) {
          workflowFrequency.set(step, { count: 0, avgDuration: 0, successRate: 0 });
        }

        const stats = workflowFrequency.get(step)!;
        stats.count++;
        stats.avgDuration = (stats.avgDuration * (stats.count - 1) + workflow.duration / workflow.workflow.length) / stats.count;
        stats.successRate = (stats.successRate * (stats.count - 1) + (workflow.success ? 1 : 0)) / stats.count;
      }
    }

    // Create enhanced suggestions
    for (const suggestion of fileAnalysis.suggestedWorkflows) {
      const stats = workflowFrequency.get(suggestion.id);
      
      if (stats && stats.count >= 3) {
        // Update suggestion with historical data
        enhancedSuggestions.push({
          ...suggestion,
          confidence: Math.max(suggestion.confidence, stats.successRate),
          estimatedDuration: stats.avgDuration,
          description: `${suggestion.description} (Based on ${stats.count} successful executions)`
        });
      } else {
        enhancedSuggestions.push(suggestion);
      }
    }

    // Add pattern-based suggestions
    const commonSequences = this.findMostSuccessfulSequences(historicalWorkflows);
    for (const sequence of commonSequences.slice(0, 2)) {
      if (!enhancedSuggestions.some(s => s.name.includes(sequence.name))) {
        enhancedSuggestions.push({
          id: `pattern_${sequence.name.replace(/\s+/g, '_').toLowerCase()}`,
          name: `Pattern: ${sequence.name}`,
          description: `Execute proven workflow pattern with ${Math.round(sequence.successRate * 100)}% success rate`,
          confidence: sequence.successRate,
          estimatedDuration: sequence.avgDuration,
          requiredTools: sequence.tools,
          automation: {
            canAutomate: true,
            automationComplexity: 'simple',
            requiredApprovals: []
          }
        });
      }
    }

    return enhancedSuggestions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Export file pattern data for analysis
   */
  exportFilePatternData() {
    const patterns = this.fileWorkflows.reduce((acc, workflow) => {
      const pattern = this.getFilePattern(workflow.category);
      if (!acc[pattern]) {
        acc[pattern] = [];
      }
      acc[pattern].push({
        workflow: workflow.workflow.join(' → '),
        success: workflow.success,
        duration: workflow.duration,
        timestamp: workflow.timestamp
      });
      return acc;
    }, {} as Record<string, any[]>);

    return {
      patterns,
      totalWorkflows: this.fileWorkflows.length,
      uniquePatterns: Object.keys(patterns).length,
      exportTimestamp: new Date()
    };
  }

  private getFilePattern(category: string): string {
    // Normalize category for pattern matching
    return category.toLowerCase().replace(/[^a-z0-9]/g, '_');
  }

  private findCommonWorkflowSequences(workflows: Array<{ sequence: string[]; success: boolean; duration: number }>): string[][] {
    const sequenceCounts = new Map<string, number>();

    for (const workflow of workflows) {
      const sequenceKey = workflow.sequence.join('→');
      sequenceCounts.set(sequenceKey, (sequenceCounts.get(sequenceKey) || 0) + 1);
    }

    return Array.from(sequenceCounts.entries())
      .filter(([_, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([sequence, _]) => sequence.split('→'));
  }

  private async analyzeWorkflowSequence(
    filePattern: string,
    sequence: string[],
    allWorkflows: Array<{ sequence: string[]; success: boolean; duration: number }>
  ): Promise<FileWorkflowPattern> {
    const sequenceKey = sequence.join('→');
    const matchingWorkflows = allWorkflows.filter(w => w.sequence.join('→') === sequenceKey);

    const frequency = matchingWorkflows.length;
    const successRate = matchingWorkflows.filter(w => w.success).length / frequency;
    const averageDuration = matchingWorkflows.reduce((sum, w) => sum + w.duration, 0) / frequency;

    const optimization = this.generateOptimizationSuggestion(sequence, successRate, averageDuration);
    const automation = this.assessAutomationPotential(sequence, successRate, frequency);

    return {
      filePattern,
      workflowSequence: sequence,
      frequency,
      successRate,
      averageDuration,
      optimization,
      automation
    };
  }

  private generateOptimizationSuggestion(sequence: string[], successRate: number, averageDuration: number): string {
    if (successRate < 0.7) {
      return `Low success rate (${Math.round(successRate * 100)}%) - review workflow steps for potential issues`;
    }

    if (averageDuration > 120000) { // 2 minutes
      return `Long execution time (${Math.round(averageDuration / 1000)}s) - consider optimizing or parallelizing steps`;
    }

    if (sequence.length > 5) {
      return 'Complex workflow - consider breaking into smaller, reusable components';
    }

    return 'Workflow performing optimally - consider automation';
  }

  private assessAutomationPotential(sequence: string[], successRate: number, frequency: number): {
    isAutomatable: boolean;
    automationScript?: string;
    requiredInputs: string[];
  } {
    const isAutomatable = successRate > 0.8 && frequency >= 5;
    const requiredInputs: string[] = [];

    // Analyze sequence for required inputs
    for (const step of sequence) {
      if (step.includes('manual') || step.includes('review') || step.includes('approval')) {
        requiredInputs.push(`user_${step.toLowerCase().replace(/\s+/g, '_')}`);
      }
    }

    return {
      isAutomatable,
      automationScript: isAutomatable ? this.generateAutomationScript(sequence) : undefined,
      requiredInputs
    };
  }

  private generateAutomationScript(sequence: string[]): string {
    // Generate a simple automation script outline
    const script = sequence.map((step, index) => {
      return `// Step ${index + 1}: ${step}
await executeWorkflowStep('${step.toLowerCase().replace(/\s+/g, '_')}', context);`;
    }).join('\n');

    return `// Auto-generated workflow script
async function executeWorkflow(fileContext) {
${script}
}`;
  }

  private findMostSuccessfulSequences(workflows: Array<{ workflow: string[]; success: boolean; duration: number }>) {
    const sequenceStats = new Map<string, {
      count: number;
      successes: number;
      totalDuration: number;
      tools: string[];
    }>();

    for (const workflow of workflows) {
      const key = workflow.workflow.join('→');
      if (!sequenceStats.has(key)) {
        sequenceStats.set(key, {
          count: 0,
          successes: 0,
          totalDuration: 0,
          tools: workflow.workflow
        });
      }

      const stats = sequenceStats.get(key)!;
      stats.count++;
      if (workflow.success) stats.successes++;
      stats.totalDuration += workflow.duration;
    }

    return Array.from(sequenceStats.entries())
      .filter(([_, stats]) => stats.count >= 3)
      .map(([sequence, stats]) => ({
        name: sequence.replace(/→/g, ' → '),
        successRate: stats.successes / stats.count,
        avgDuration: stats.totalDuration / stats.count,
        frequency: stats.count,
        tools: stats.tools
      }))
      .sort((a, b) => (b.successRate * b.frequency) - (a.successRate * a.frequency))
      .slice(0, 3);
  }
}