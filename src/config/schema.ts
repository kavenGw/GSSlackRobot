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

export interface AppConfig {
  slack: SlackConfig;
  claude: ClaudeConfig;
}
