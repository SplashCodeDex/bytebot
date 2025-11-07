import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface GitHubPullRequest {
  id: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  html_url: string;
  created_at: string;
  updated_at: string;
}

export interface GitHubIssue {
  id: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: Array<{ name: string; color: string }>;
  assignees: Array<{ login: string }>;
  html_url: string;
}

@Injectable()
export class GitHubIntegrationService {
  private readonly logger = new Logger(GitHubIntegrationService.name);
  private readonly baseUrl = 'https://api.github.com';
  private readonly token: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.token = this.configService.get<string>('GITHUB_TOKEN') || '';
    if (!this.token) {
      this.logger.warn('GITHUB_TOKEN not configured. GitHub integration will be limited.');
    }
  }

  private getHeaders() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ByteBot-Rovo-Integration/1.0'
    };
  }

  /**
   * Create a pull request for Rovo AI code changes
   */
  async createPullRequest(options: {
    owner: string;
    repo: string;
    title: string;
    body: string;
    head: string;
    base: string;
  }): Promise<GitHubPullRequest> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/repos/${options.owner}/${options.repo}/pulls`,
          {
            title: options.title,
            body: options.body,
            head: options.head,
            base: options.base,
          },
          { headers: this.getHeaders() }
        )
      );

      this.logger.log(`Created PR: ${response.data.html_url}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create PR: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create an issue for bugs found by Rovo AI
   */
  async createIssue(options: {
    owner: string;
    repo: string;
    title: string;
    body: string;
    labels?: string[];
    assignees?: string[];
  }): Promise<GitHubIssue> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/repos/${options.owner}/${options.repo}/issues`,
          {
            title: options.title,
            body: options.body,
            labels: options.labels || [],
            assignees: options.assignees || [],
          },
          { headers: this.getHeaders() }
        )
      );

      this.logger.log(`Created issue: ${response.data.html_url}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create issue: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get repository information
   */
  async getRepository(owner: string, repo: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/repos/${owner}/${repo}`,
          { headers: this.getHeaders() }
        )
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get repository info: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get recent commits for analysis
   */
  async getRecentCommits(owner: string, repo: string, since?: string) {
    try {
      const params = since ? { since } : {};
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/repos/${owner}/${repo}/commits`,
          {
            headers: this.getHeaders(),
            params
          }
        )
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get commits: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a review comment on a pull request
   */
  async createReviewComment(options: {
    owner: string;
    repo: string;
    pull_number: number;
    body: string;
    path: string;
    line: number;
  }) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/repos/${options.owner}/${options.repo}/pulls/${options.pull_number}/comments`,
          {
            body: options.body,
            path: options.path,
            line: options.line,
          },
          { headers: this.getHeaders() }
        )
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create review comment: ${error.message}`);
      throw error;
    }
  }

  /**
   * Trigger Rovo AI code review workflow for a repository
   */
  async triggerRovoCodeReview(owner: string, repo: string, branch: string = 'main') {
    try {
      this.logger.log(`Triggering Rovo AI code review for ${owner}/${repo}:${branch}`);
      
      // This would integrate with ByteBot's workflow system
      // to trigger the ROVO_CODE_REVIEW_WORKFLOW
      
      return {
        status: 'triggered',
        workflow: 'rovo-code-review-automated',
        repository: `${owner}/${repo}`,
        branch,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error(`Failed to trigger Rovo code review: ${error.message}`);
      throw error;
    }
  }
}