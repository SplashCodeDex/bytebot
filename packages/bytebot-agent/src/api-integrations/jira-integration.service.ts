import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description: string;
    status: { name: string };
    priority: { name: string };
    issuetype: { name: string };
    assignee: { displayName: string } | null;
    created: string;
    updated: string;
  };
}

@Injectable()
export class JiraIntegrationService {
  private readonly logger = new Logger(JiraIntegrationService.name);
  private readonly baseUrl: string;
  private readonly email: string;
  private readonly apiToken: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('JIRA_BASE_URL') || '';
    this.email = this.configService.get<string>('JIRA_EMAIL') || '';
    this.apiToken = this.configService.get<string>('JIRA_API_TOKEN') || '';
    
    if (!this.baseUrl || !this.email || !this.apiToken) {
      this.logger.warn('JIRA credentials not fully configured. Jira integration will be limited.');
    }
  }

  private getHeaders() {
    const auth = Buffer.from(`${this.email}:${this.apiToken}`).toString('base64');
    return {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
  }

  /**
   * Create a Jira issue for bugs found by Rovo AI
   */
  async createBugIssue(options: {
    projectKey: string;
    summary: string;
    description: string;
    priority?: 'Highest' | 'High' | 'Medium' | 'Low' | 'Lowest';
    assignee?: string;
    labels?: string[];
  }): Promise<JiraIssue> {
    try {
      const issueData = {
        fields: {
          project: { key: options.projectKey },
          summary: options.summary,
          description: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: options.description
                  }
                ]
              }
            ]
          },
          issuetype: { name: 'Bug' },
          priority: { name: options.priority || 'Medium' },
          ...(options.assignee && { assignee: { accountId: options.assignee } }),
          ...(options.labels && { labels: options.labels.map(label => ({ name: label })) })
        }
      };

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/rest/api/3/issue`,
          issueData,
          { headers: this.getHeaders() }
        )
      );

      this.logger.log(`Created Jira issue: ${response.data.key}`);
      return await this.getIssue(response.data.key);
    } catch (error) {
      this.logger.error(`Failed to create Jira issue: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a task for Rovo AI development work
   */
  async createDevelopmentTask(options: {
    projectKey: string;
    summary: string;
    description: string;
    storyPoints?: number;
    labels?: string[];
    assignee?: string;
  }): Promise<JiraIssue> {
    try {
      const issueData = {
        fields: {
          project: { key: options.projectKey },
          summary: options.summary,
          description: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: options.description
                  }
                ]
              }
            ]
          },
          issuetype: { name: 'Task' },
          ...(options.storyPoints && { customfield_10016: options.storyPoints }), // Story Points field
          ...(options.assignee && { assignee: { accountId: options.assignee } }),
          ...(options.labels && { labels: options.labels.map(label => ({ name: label })) })
        }
      };

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/rest/api/3/issue`,
          issueData,
          { headers: this.getHeaders() }
        )
      );

      this.logger.log(`Created Jira task: ${response.data.key}`);
      return await this.getIssue(response.data.key);
    } catch (error) {
      this.logger.error(`Failed to create Jira task: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get issue details
   */
  async getIssue(issueKey: string): Promise<JiraIssue> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/rest/api/3/issue/${issueKey}`,
          { headers: this.getHeaders() }
        )
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get Jira issue: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update issue status (for workflow automation)
   */
  async updateIssueStatus(issueKey: string, transitionId: string, comment?: string) {
    try {
      const transitionData: any = {
        transition: { id: transitionId }
      };

      if (comment) {
        transitionData.update = {
          comment: [
            {
              add: {
                body: {
                  type: 'doc',
                  version: 1,
                  content: [
                    {
                      type: 'paragraph',
                      content: [
                        {
                          type: 'text',
                          text: comment
                        }
                      ]
                    }
                  ]
                }
              }
            }
          ]
        };
      }

      await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/rest/api/3/issue/${issueKey}/transitions`,
          transitionData,
          { headers: this.getHeaders() }
        )
      );

      this.logger.log(`Updated Jira issue status: ${issueKey}`);
    } catch (error) {
      this.logger.error(`Failed to update Jira issue status: ${error.message}`);
      throw error;
    }
  }

  /**
   * Search issues with JQL
   */
  async searchIssues(jql: string, maxResults: number = 50) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/rest/api/3/search`,
          {
            jql,
            maxResults,
            fields: ['summary', 'status', 'assignee', 'created', 'updated', 'priority']
          },
          { headers: this.getHeaders() }
        )
      );
      return response.data.issues;
    } catch (error) {
      this.logger.error(`Failed to search Jira issues: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a code review task linked to a pull request
   */
  async createCodeReviewTask(options: {
    projectKey: string;
    pullRequestUrl: string;
    repository: string;
    branch: string;
    assignee?: string;
  }): Promise<JiraIssue> {
    const summary = `Code Review: ${options.repository}/${options.branch}`;
    const description = `
Automated code review task created by Rovo AI.

**Repository:** ${options.repository}
**Branch:** ${options.branch}
**Pull Request:** ${options.pullRequestUrl}

**Review Checklist:**
- [ ] Security analysis completed
- [ ] Performance impact assessed
- [ ] Tests are comprehensive
- [ ] Documentation is updated
- [ ] Code follows style guidelines

This task was created automatically by ByteBot + Rovo AI integration.
    `.trim();

    return this.createDevelopmentTask({
      projectKey: options.projectKey,
      summary,
      description,
      labels: ['rovo-ai', 'code-review', 'automated'],
      assignee: options.assignee
    });
  }
}