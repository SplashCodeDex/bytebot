export interface VisualPattern {
  id: string;
  type: 'button' | 'input' | 'dropdown' | 'dialog' | 'form' | 'menu' | 'icon' | 'text' | 'image';
  confidence: number;
  boundingBox: BoundingBox;
  attributes: PatternAttributes;
  context: VisualContext;
  variations: PatternVariation[];
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PatternAttributes {
  text?: string;
  color?: string;
  size?: string;
  shape?: string;
  accessibility?: AccessibilityInfo;
  selectors: ElementSelector[];
}

export interface AccessibilityInfo {
  role?: string;
  label?: string;
  description?: string;
  ariaAttributes?: Record<string, string>;
}

export interface ElementSelector {
  type: 'xpath' | 'css' | 'id' | 'class' | 'text' | 'image';
  value: string;
  confidence: number;
}

export interface VisualContext {
  applicationName: string;
  windowTitle: string;
  url?: string;
  viewport: { width: number; height: number };
  timestamp: Date;
  surroundingElements: VisualPattern[];
}

export interface PatternVariation {
  id: string;
  description: string;
  differenceScore: number;
  attributes: Partial<PatternAttributes>;
  examples: string[]; // Base64 encoded images
}

export interface UserInteractionSequence {
  id: string;
  sessionId: string;
  name?: string;
  description?: string;
  steps: InteractionStep[];
  frequency: number;
  lastPerformed: Date;
  automationPotential: AutomationPotential;
  context: InteractionContext;
}

export interface InteractionStep {
  id: string;
  order: number;
  type: 'click' | 'type' | 'scroll' | 'wait' | 'drag' | 'key_press' | 'hover';
  target: ElementTarget;
  data?: any;
  timing: StepTiming;
  screenshot?: string;
  success: boolean;
  retryCount: number;
}

export interface ElementTarget {
  element: VisualPattern;
  coordinates?: { x: number; y: number };
  text?: string;
  expectedState?: ElementState;
}

export interface ElementState {
  visible: boolean;
  enabled: boolean;
  focused: boolean;
  value?: string;
}

export interface StepTiming {
  startTime: Date;
  duration: number;
  waitBefore?: number;
  waitAfter?: number;
}

export interface AutomationPotential {
  score: number; // 0-1
  reasoning: string[];
  complexity: 'low' | 'medium' | 'high';
  prerequisites: string[];
  risks: string[];
  estimatedTimeToAutomate: number; // minutes
  estimatedTimeSavings: number; // minutes per execution
}

export interface InteractionContext {
  applicationName: string;
  workflowCategory: string;
  businessProcess?: string;
  dataInvolved: string[];
  externalDependencies: string[];
}

export interface ApplicationState {
  id: string;
  applicationName: string;
  timestamp: Date;
  state: StateSnapshot;
  previousState?: ApplicationState;
  changeDetected: boolean;
  confidence: number;
}

export interface StateSnapshot {
  windowTitle: string;
  url?: string;
  activeElements: VisualPattern[];
  formData: Record<string, any>;
  notifications: NotificationState[];
  loadingIndicators: LoadingState[];
  errors: ErrorState[];
}

export interface NotificationState {
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
  location: BoundingBox;
  timestamp: Date;
}

export interface LoadingState {
  type: 'spinner' | 'progress_bar' | 'skeleton' | 'overlay';
  location: BoundingBox;
  progress?: number;
}

export interface ErrorState {
  type: 'validation' | 'network' | 'server' | 'permission' | 'timeout';
  message: string;
  location: BoundingBox;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface PatternMatchResult {
  pattern: VisualPattern;
  confidence: number;
  location: BoundingBox;
  variations: PatternVariation[];
  contextMatch: number;
  suggestions: AutomationSuggestion[];
}

export interface AutomationSuggestion {
  id: string;
  type: 'workflow_creation' | 'pattern_learning' | 'error_handling' | 'optimization';
  title: string;
  description: string;
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
  category: string;
  actions: SuggestedAction[];
  prerequisites?: string[];
  benefits: string[];
  risks: string[];
}

export interface SuggestedAction {
  type: 'create_workflow' | 'add_pattern' | 'improve_selector' | 'add_validation' | 'handle_error';
  description: string;
  parameters: Record<string, any>;
  automatable: boolean;
}

export interface LearningSession {
  id: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  interactions: UserInteractionSequence[];
  patterns: VisualPattern[];
  insights: SessionInsight[];
  automationOpportunities: AutomationSuggestion[];
}

export interface SessionInsight {
  type: 'repetitive_task' | 'error_prone_step' | 'optimization_opportunity' | 'new_pattern';
  description: string;
  evidence: any[];
  confidence: number;
  actionable: boolean;
}

export interface PatternLearningConfig {
  visualSimilarityThreshold: number;
  interactionSimilarityThreshold: number;
  minimumOccurrences: number;
  learningEnabled: boolean;
  autoSuggestionEnabled: boolean;
  confidenceThreshold: number;
  retentionDays: number;
}

export interface AnomalyDetectionConfig {
  enableUIChangeDetection: boolean;
  enablePerformanceMonitoring: boolean;
  enableErrorRateMonitoring: boolean;
  thresholds: {
    uiChangeThreshold: number;
    performanceDeviationPercent: number;
    errorRateThreshold: number;
    responseTimeThreshold: number;
  };
  alerting: {
    enabled: boolean;
    channels: string[];
    severityLevels: string[];
  };
}

export interface ContextAwarenessData {
  currentApplication: string;
  activeWorkflow?: string;
  userIntentions: IntentionPrediction[];
  environmentState: EnvironmentState;
  historicalContext: HistoricalContext;
}

export interface IntentionPrediction {
  intention: string;
  confidence: number;
  evidence: string[];
  suggestedNextSteps: string[];
}

export interface EnvironmentState {
  timeOfDay: string;
  dayOfWeek: string;
  systemLoad: number;
  networkQuality: 'poor' | 'fair' | 'good' | 'excellent';
  concurrentTasks: number;
}

export interface HistoricalContext {
  similarSessions: LearningSession[];
  frequentPatterns: VisualPattern[];
  commonErrors: ErrorState[];
  performanceBaselines: PerformanceBaseline[];
}

export interface PerformanceBaseline {
  operation: string;
  averageTime: number;
  standardDeviation: number;
  successRate: number;
  lastUpdated: Date;
}

export interface PatternRecognitionMetrics {
  totalPatternsLearned: number;
  accurateMatches: number;
  falsePositives: number;
  falseNegatives: number;
  averageConfidence: number;
  learningRate: number;
  automationSuccessRate: number;
  timeSaved: number; // minutes
  errorsReduced: number;
}