export interface SlackConfig {
  botToken: string;
  appToken: string;
}

export interface GitLabConfig {
  url: string;
  token: string;
  defaultProject: string;
}

export interface JenkinsConfig {
  url: string;
  user: string;
  token: string;
  jobs: Record<string, string>;
}

export interface ClaudeConfig {
  command: string;
  timeoutMs: number;
  anthropicBaseUrl?: string;
  anthropicAuthToken?: string;
  projectDir?: string;
  dangerouslySkipPermissions?: boolean;
}

export interface WebhookConfig {
  port: number;
  gitlabSecret: string;
  notifyChannel: string;
  events: {
    push: boolean;
    merge_request: boolean;
    pipeline: boolean;
    issue: boolean;
    note: boolean;
  };
}

export interface AppConfig {
  slack: SlackConfig;
  gitlab: GitLabConfig;
  jenkins: JenkinsConfig;
  claude: ClaudeConfig;
  webhook: WebhookConfig;
}
