export const DEFAULT_MODEL = {
  name: 'rovo-dev-ai-v1',
  provider: 'rovo',
  description: 'Rovo Dev AI with computer control capabilities',
  contextWindow: 200000,
  maxOutputTokens: 8192,
  supportsTools: true,
  supportsVision: true,
  supportsBeta: true,
};

export const AVAILABLE_MODELS = [
  DEFAULT_MODEL,
  {
    name: 'rovo-dev-ai-code-focused',
    provider: 'rovo',
    description: 'Rovo Dev AI optimized for code analysis and development tasks',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsVision: true,
    supportsBeta: true,
  },
  {
    name: 'rovo-dev-ai-debugging',
    provider: 'rovo',
    description: 'Rovo Dev AI specialized for debugging and problem solving',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsVision: true,
    supportsBeta: true,
  }
];

export const ROVO_API_CONFIG = {
  baseURL: 'https://api.rovo.atlassian.com/ai',
  maxRetries: 3,
  timeout: 60000,
  retryDelay: 1000,
};