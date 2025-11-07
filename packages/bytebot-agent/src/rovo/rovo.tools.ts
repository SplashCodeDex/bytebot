import { anthropicTools } from '../anthropic/anthropic.tools';

// Rovo Dev AI uses the same computer tools as other providers
// but with enhanced understanding of development workflows
export const rovoTools = [
  ...anthropicTools,
  {
    name: 'analyze_development_context',
    description: 'Analyze the current development context and suggest optimal actions',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['analyze_screen', 'identify_ide', 'detect_language', 'suggest_workflow'],
          description: 'Type of development context analysis to perform'
        },
        focus_area: {
          type: 'string',
          description: 'Specific area to focus analysis on (e.g., code editor, terminal, browser)'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'code_aware_action',
    description: 'Perform computer actions with awareness of code structure and development best practices',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['smart_click', 'code_navigation', 'intelligent_type', 'context_screenshot'],
          description: 'Type of code-aware action to perform'
        },
        target: {
          type: 'string',
          description: 'Target element or location for the action'
        },
        code_context: {
          type: 'object',
          properties: {
            language: { type: 'string' },
            file_type: { type: 'string' },
            current_function: { type: 'string' },
            line_number: { type: 'number' }
          },
          description: 'Current code context for intelligent action planning'
        },
        coordinate: {
          type: 'array',
          items: { type: 'number' },
          minItems: 2,
          maxItems: 2,
          description: 'Coordinate for click/drag actions [x, y]'
        },
        text: {
          type: 'string',
          description: 'Text to type (for typing actions)'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'development_workflow',
    description: 'Execute common development workflows like testing, debugging, or refactoring',
    input_schema: {
      type: 'object',
      properties: {
        workflow: {
          type: 'string',
          enum: ['run_tests', 'start_debugger', 'open_terminal', 'switch_branch', 'commit_changes', 'open_file'],
          description: 'Development workflow to execute'
        },
        parameters: {
          type: 'object',
          description: 'Workflow-specific parameters',
          properties: {
            file_path: { type: 'string' },
            command: { type: 'string' },
            branch_name: { type: 'string' },
            commit_message: { type: 'string' }
          }
        }
      },
      required: ['workflow']
    }
  }
];