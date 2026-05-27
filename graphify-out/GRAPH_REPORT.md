# Graph Report - .  (2026-05-27)

## Corpus Check
- Corpus is ~38,983 words - fits in a single context window. You may not need a graph.

## Summary
- 344 nodes · 597 edges · 19 communities detected
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 96 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_GitLab Commands & Reports|GitLab Commands & Reports]]
- [[_COMMUNITY_GitLab Migration Plans|GitLab Migration Plans]]
- [[_COMMUNITY_Config & Bootstrap|Config & Bootstrap]]
- [[_COMMUNITY_Slack Command Handlers|Slack Command Handlers]]
- [[_COMMUNITY_Project Context & Messaging Rationale|Project Context & Messaging Rationale]]
- [[_COMMUNITY_Help & Commands Registry|Help & Commands Registry]]
- [[_COMMUNITY_Claude SDK Integration|Claude SDK Integration]]
- [[_COMMUNITY_Slack Message Safety|Slack Message Safety]]
- [[_COMMUNITY_App Bootstrap & Webhooks|App Bootstrap & Webhooks]]
- [[_COMMUNITY_Env Validation Logic|Env Validation Logic]]
- [[_COMMUNITY_Gemini Integration|Gemini Integration]]
- [[_COMMUNITY_Bot Simplification & Gemini Plans|Bot Simplification & Gemini Plans]]
- [[_COMMUNITY_Model Config & Debug Log|Model Config & Debug Log]]
- [[_COMMUNITY_GitLab REST Service Layer|GitLab REST Service Layer]]
- [[_COMMUNITY_Jenkins Script Console Service|Jenkins Script Console Service]]
- [[_COMMUNITY_Config Schema Stub|Config Schema Stub]]
- [[_COMMUNITY_Config Index Stub|Config Index Stub]]
- [[_COMMUNITY_Env Validator Stub|Env Validator Stub]]
- [[_COMMUNITY_Jenkins Mention Bootstrap|Jenkins Mention Bootstrap]]

## God Nodes (most connected - your core abstractions)
1. `getConfig()` - 32 edges
2. `ts()` - 15 edges
3. `registerCommands (app_mention router)` - 13 edges
4. `handleClaude()` - 10 edges
5. `Plan: Safe Message Send` - 10 edges
6. `safePost()` - 9 edges
7. `CommandContext interface` - 9 edges
8. `generateDailyReport()` - 8 edges
9. `handleResetDailyReport()` - 8 edges
10. `loadConfig()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Slack channels:history / message.channels scope requirement` --rationale_for--> `registerJenkinsMention()`  [INFERRED]
  docs/setup-guide.md → src/events/jenkins-mention.ts
- `data/settings.json` --references--> `Technical reference`  [INFERRED]
  src/services/settings.ts → docs/technical-reference.md
- `GitLab event formatter` --references--> `GitLab ops doc`  [INFERRED]
  src/webhooks/gitlab.ts → docs/gitlab-ops.md
- `Delete GitLab/Jenkins/Webhook Files` --references--> `src/webhooks/server.ts`  [EXTRACTED]
  docs/plans/2026-02-24-simplify-bot-plan.md → src/webhooks/server.ts
- `Slack Model Config Design` --references--> `src/services/settings.ts`  [EXTRACTED]
  docs/plans/2026-02-28-slack-model-config-design.md → src/services/settings.ts

## Hyperedges (group relationships)
- **Jenkins @channel amplifier end-to-end flow** — env_JENKINS_NOTIFY_CHANNEL, config_loadConfig, envvalidator_jenkinsmention_rule, jenkinsmention_registerJenkinsMention, jenkinsmention_filter_pipeline, jenkinsmention_repost_atchannel [EXTRACTED 0.95]
- **Config load + two-stage validation pipeline** — config_loadConfig, envvalidator_validateRequiredEnvVars, envvalidator_validateConfig, envvalidator_EnvValidationError, schema_AppConfig [EXTRACTED 0.90]
- **Spec -> Plan -> Implementation triad for jenkins-mention** — doc_jenkinsmention_design, doc_jenkinsmention_plan, jenkinsmention_registerJenkinsMention [EXTRACTED 0.90]

## Communities (19 total, 6 thin omitted)

### Community 0 - "GitLab Commands & Reports"
Cohesion: 0.15
Nodes (27): formatDate(), handleCreateMilestone(), generateDailyReport(), handleDailyReport(), handleResetDailyReport(), snapshotPath(), todayStr(), yesterdayStr() (+19 more)

### Community 1 - "GitLab Migration Plans"
Cohesion: 0.07
Nodes (35): Delete GitLab/Jenkins/Webhook Files, create-milestone Command, daily-report Command, daily-report Scheduler (setTimeout), GitLab Commands Migration Plan, list-issues Command, list-milestones Command, Express Choice Rationale (+27 more)

### Community 2 - "Config & Bootstrap"
Cohesion: 0.07
Nodes (35): App Bootstrap (app.ts), loadConfig() invocation in bootstrap, Single Instance Guard at Startup, Channel Purity (ops convention, not code-enforced), Config change sync rule (CLAUDE.md / setup-guide / .env.example), Design-then-plan docs workflow (specs/ -> plans/), Jenkins @channel Amplifier Pattern, Two-stage env validation (existence + validity) (+27 more)

### Community 3 - "Slack Command Handlers"
Cohesion: 0.08
Nodes (34): App Entry Point, handleCommands (list Claude slash cmds), handleCreateMilestone, DailySnapshot type, generateDailyReport (block builder), handleDailyReport, handleResetDailyReport, handleGemini (+26 more)

### Community 4 - "Project Context & Messaging Rationale"
Cohesion: 0.06
Nodes (33): Claude done notification rationale, Command change sync checklist, Env validation mechanism, Message function selection rationale, CLAUDE.md project context, Slash prefix escape rationale, Slack channels:history / message.channels scope requirement, Claude integration doc (+25 more)

### Community 5 - "Help & Commands Registry"
Cohesion: 0.16
Nodes (21): formatSection(), handleCommands(), listMdFiles(), handleHelp(), CommandContext interface, downloadSlackImages(), handleClaude(), parseModelPrefix() (+13 more)

### Community 6 - "Claude SDK Integration"
Cohesion: 0.08
Nodes (26): ClaudeImage type, CommandContext interface, @anthropic-ai/claude-agent-sdk, askClaude, handleClaude, config/index.ts, config/schema.ts, Design: README GitHub SEO (+18 more)

### Community 7 - "Slack Message Safety"
Cohesion: 0.09
Nodes (25): commands/daily-report.ts, commands/gemini.ts, help command, commands/index.ts, commands/list-milestone-issues.ts, commands/list-milestones.ts, model command handler, data/settings.json (+17 more)

### Community 8 - "App Bootstrap & Webhooks"
Cohesion: 0.13
Nodes (8): loadKnownSessions(), registerCommands(), registerJenkinsMention(), scheduleDailyReport(), ts(), ensureSingleInstance(), handleGitLabEvent(), startWebhookServer()

### Community 9 - "Env Validation Logic"
Cohesion: 0.17
Nodes (16): EnvValidationError, formatValidationErrors(), isValidToken(), isValidUrl(), validateConfig(), validateRequiredEnvVars(), EnvValidationError class, validateConfig (+8 more)

### Community 10 - "Gemini Integration"
Cohesion: 0.25
Nodes (11): handleGeminiDraw(), handleGemini(), askGemini(), drawGemini(), convertTables(), createTracker(), markdownToSlack(), safeChat() (+3 more)

### Community 11 - "Bot Simplification & Gemini Plans"
Cohesion: 0.17
Nodes (13): Inline Claude Passthrough Routing, Simplify AppConfig to Slack+Claude, Simplify Bot Plan, Thread-scoped Gemini Chat History, Gemini Command Implementation Plan, @google/generative-ai SDK, Slack files.uploadV2, Gemini Draw Design (+5 more)

### Community 12 - "Model Config & Debug Log"
Cohesion: 0.22
Nodes (10): DEBUG_CLAUDE Env Var, Claude Debug Log Design, claude_raw.log File, Claude Debug Log Plan, Inline opus/sonnet/haiku Prefix, max effort only valid for opus, Slack Model Config Design, data/settings.json Persistence (+2 more)

## Knowledge Gaps
- **93 isolated node(s):** `COMMAND_ALIASES map`, `downloadSlackImages`, `threadToSessionId (uuidv5)`, `handleCommands (list Claude slash cmds)`, `DailySnapshot type` (+88 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@anthropic-ai/claude-agent-sdk` connect `Claude SDK Integration` to `Help & Commands Registry`?**
  _High betweenness centrality (0.145) - this node is a cross-community bridge._
- **Why does `askClaude` connect `Claude SDK Integration` to `Slack Message Safety`?**
  _High betweenness centrality (0.093) - this node is a cross-community bridge._
- **Are the 16 inferred relationships involving `getConfig()` (e.g. with `handleCommands()` and `handleCreateMilestone()`) actually correct?**
  _`getConfig()` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `handleClaude()` (e.g. with `getConfig()` and `createTracker()`) actually correct?**
  _`handleClaude()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `COMMAND_ALIASES map`, `downloadSlackImages`, `threadToSessionId (uuidv5)` to the rest of the system?**
  _93 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `GitLab Migration Plans` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Config & Bootstrap` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._