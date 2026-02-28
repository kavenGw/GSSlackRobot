export interface SlackConfig {
  botToken: string;
  appToken: string;
}

export interface ClaudeConfig {
  command: string;
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

export interface GitLabConfig {
  apiUrl: string;
  token: string;
  projectId: string;
}

export interface JenkinsCronJob {
  jobName: string;
  hour: number;
  minute: number;
}

export interface JenkinsConfig {
  url: string;
  username: string;
  apiToken: string;
  cronJobs?: JenkinsCronJob[];
}

export interface GeminiConfig {
  apiKey: string;
  model: string;
  imageModel: string;
}

export interface AppConfig {
  slack: SlackConfig;
  claude: ClaudeConfig;
  gitlabNotify?: GitLabNotifyConfig;
  gitlab?: GitLabConfig;
  jenkins?: JenkinsConfig;
  gemini?: GeminiConfig;
}
