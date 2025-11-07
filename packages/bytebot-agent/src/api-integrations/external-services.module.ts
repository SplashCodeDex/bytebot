import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { GitHubIntegrationService } from './github-integration.service';
import { JiraIntegrationService } from './jira-integration.service';
import { SlackIntegrationService } from './slack-integration.service';
import { DockerIntegrationService } from './docker-integration.service';
import { SonarQubeIntegrationService } from './sonarqube-integration.service';
import { ExternalServicesController } from './external-services.controller';
import { WebhookService } from './webhook.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    ConfigModule,
  ],
  providers: [
    GitHubIntegrationService,
    JiraIntegrationService,
    SlackIntegrationService,
    DockerIntegrationService,
    SonarQubeIntegrationService,
    WebhookService,
  ],
  controllers: [ExternalServicesController],
  exports: [
    GitHubIntegrationService,
    JiraIntegrationService,
    SlackIntegrationService,
    DockerIntegrationService,
    SonarQubeIntegrationService,
    WebhookService,
  ],
})
export class ExternalServicesModule {}