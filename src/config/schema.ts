export interface SlackConfig {
  botToken: string;
  appToken: string;
}

export interface ClaudeConfig {
  command: string;
  timeoutMs: number;
  anthropicBaseUrl?: string;
  anthropicAuthToken?: string;
  projectDir?: string;
  dangerouslySkipPermissions?: boolean;
}

export interface GitLabNotifyConfig {
  port: number;
  secret: string;
  channel: string;
  events: {
    push: boolean;
    mr: boolean;
    pipeline: boolean;
    issue: boolean;
    note: boolean;
  };
}

export interface AppConfig {
  slack: SlackConfig;
  claude: ClaudeConfig;
  gitlabNotify?: GitLabNotifyConfig;
}
