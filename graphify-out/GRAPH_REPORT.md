# Graph Report - .  (2026-05-23)

## Corpus Check
- Corpus is ~36,479 words - fits in a single context window. You may not need a graph.

## Summary
- 305 nodes · 544 edges · 17 communities detected
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 88 edges (avg confidence: 0.81)
- Token cost: 96,500 input · 24,600 output

## Community Hubs (Navigation)
- [[_COMMUNITY_GitLab Ops Plans|GitLab Ops Plans]]
- [[_COMMUNITY_Daily Report Handlers|Daily Report Handlers]]
- [[_COMMUNITY_Project Documentation (CLAUDE.md)|Project Documentation (CLAUDE.md)]]
- [[_COMMUNITY_Gemini Command Layer|Gemini Command Layer]]
- [[_COMMUNITY_Claude SDK Integration|Claude SDK Integration]]
- [[_COMMUNITY_Milestone Commands|Milestone Commands]]
- [[_COMMUNITY_App Bootstrap & Slash Commands|App Bootstrap & Slash Commands]]
- [[_COMMUNITY_Doc-to-Source References|Doc-to-Source References]]
- [[_COMMUNITY_Env Validation|Env Validation]]
- [[_COMMUNITY_Model & Effort Selection|Model & Effort Selection]]
- [[_COMMUNITY_Bot Simplification Plans|Bot Simplification Plans]]
- [[_COMMUNITY_Debug & Model Config Plans|Debug & Model Config Plans]]
- [[_COMMUNITY_GitLab REST Service (orphan)|GitLab REST Service (orphan)]]
- [[_COMMUNITY_Jenkins Script Console (orphan)|Jenkins Script Console (orphan)]]
- [[_COMMUNITY_configschema.ts (orphan)|config/schema.ts (orphan)]]
- [[_COMMUNITY_configindex.ts (orphan)|config/index.ts (orphan)]]
- [[_COMMUNITY_configenv-validator.ts (orphan)|config/env-validator.ts (orphan)]]

## God Nodes (most connected - your core abstractions)
1. `getConfig()` - 30 edges
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
- `Technical reference` --references--> `data/settings.json`  [INFERRED]
  docs/technical-reference.md → src/services/settings.ts
- `GitLab ops doc` --references--> `GitLab event formatter`  [INFERRED]
  docs/gitlab-ops.md → src/webhooks/gitlab.ts
- `Delete GitLab/Jenkins/Webhook Files` --references--> `src/webhooks/server.ts`  [EXTRACTED]
  docs/plans/2026-02-24-simplify-bot-plan.md → src/webhooks/server.ts
- `Slack Model Config Design` --references--> `src/services/settings.ts`  [EXTRACTED]
  docs/plans/2026-02-28-slack-model-config-design.md → src/services/settings.ts
- `Plan: Slack Claude Model Config` --references--> `settings service`  [EXTRACTED]
  docs/plans/2026-02-28-slack-model-config-plan.md → src/services/settings.ts

## Hyperedges (group relationships)
- **Slack app_mention dispatch pipeline** — commands_index_registerCommands, commands_index_COMMAND_ALIASES, commands_index_CommandContext, commands_index_handleClaude [EXTRACTED 0.95]
- **Daily report generation flow** — scheduler_dailyreport_scheduleDailyReport, commands_dailyreport_generateDailyReport, services_gitlab_getLatestActiveMilestone, services_gitlab_getIssues [EXTRACTED 0.95]
- **Config validation pipeline** — config_index_loadConfig, config_envvalidator_validateRequiredEnvVars, config_envvalidator_validateConfig, config_envvalidator_EnvValidationError, config_schema_AppConfig [EXTRACTED 0.95]
- **Slack message safety layer** — message_safepost, message_safeupdate, message_safechat, message_segmenttracker, message_splittoblocks [EXTRACTED 0.95]
- **GitLab webhook pipeline** — webhooks_server, webhooks_gitlab_formatter, doc_gitlabops [EXTRACTED 0.90]
- **Runtime settings persistence** — settings_loadsettings, settings_savesettings, settings_datafile [EXTRACTED 0.95]
- **Scheduler Subsystem (daily-report + jenkins-cron + guard)** — src_scheduler_daily_report, src_scheduler_jenkins_cron, src_utils_scheduler_guard [EXTRACTED 0.90]
- **GitLab Integration (service + webhooks + commands)** — src_services_gitlab, src_webhooks_gitlab, 2026-02-25-gitlab-commands-design_list_milestones_cmd, 2026-02-25-gitlab-commands-design_daily_report_cmd [INFERRED 0.85]
- **Three-stage Config Layer** — src_config_schema, src_config_index, src_config_env_validator [EXTRACTED 0.95]
- **Claude chat handler pipeline** — commands_handleClaude, claude_askClaude, safeUpdate_fn, markdownToSlack_fn [INFERRED 0.85]
- **Daily report generation flow** — scheduler_daily_report, commands_daily_report, services_gitlab, getLatestActiveMilestone_fn [EXTRACTED 1.00]
- **Slack model config persistence flow** — commands_model, settings_service, claude_askClaude, data_settings_json [EXTRACTED 1.00]

## Communities (17 total, 5 thin omitted)

### Community 0 - "GitLab Ops Plans"
Cohesion: 0.07
Nodes (35): Delete GitLab/Jenkins/Webhook Files, create-milestone Command, daily-report Command, daily-report Scheduler (setTimeout), GitLab Commands Migration Plan, list-issues Command, list-milestones Command, Express Choice Rationale (+27 more)

### Community 1 - "Daily Report Handlers"
Cohesion: 0.08
Nodes (34): App Entry Point, handleCommands (list Claude slash cmds), handleCreateMilestone, DailySnapshot type, generateDailyReport (block builder), handleDailyReport, handleResetDailyReport, handleGemini (+26 more)

### Community 2 - "Project Documentation (CLAUDE.md)"
Cohesion: 0.07
Nodes (32): Claude done notification rationale, Command change sync checklist, Env validation mechanism, Message function selection rationale, CLAUDE.md project context, Slash prefix escape rationale, Claude integration doc, Flowchart doc (+24 more)

### Community 3 - "Gemini Command Layer"
Cohesion: 0.16
Nodes (20): handleGeminiDraw(), handleGemini(), handleHelp(), CommandContext interface, downloadSlackImages(), handleClaude(), saveKnownSessions(), threadToSessionId() (+12 more)

### Community 4 - "Claude SDK Integration"
Cohesion: 0.08
Nodes (26): ClaudeImage type, CommandContext interface, @anthropic-ai/claude-agent-sdk, askClaude, handleClaude, config/index.ts, config/schema.ts, Design: README GitHub SEO (+18 more)

### Community 5 - "Milestone Commands"
Cohesion: 0.18
Nodes (22): formatDate(), handleCreateMilestone(), generateDailyReport(), handleDailyReport(), handleResetDailyReport(), snapshotPath(), todayStr(), yesterdayStr() (+14 more)

### Community 6 - "App Bootstrap & Slash Commands"
Cohesion: 0.13
Nodes (13): formatSection(), handleCommands(), listMdFiles(), loadKnownSessions(), registerCommands(), getConfig(), scheduleDailyReport(), scheduleJenkinsCronJobs() (+5 more)

### Community 7 - "Doc-to-Source References"
Cohesion: 0.09
Nodes (25): commands/daily-report.ts, commands/gemini.ts, help command, commands/index.ts, commands/list-milestone-issues.ts, commands/list-milestones.ts, model command handler, data/settings.json (+17 more)

### Community 8 - "Env Validation"
Cohesion: 0.17
Nodes (16): EnvValidationError, formatValidationErrors(), isValidToken(), isValidUrl(), validateConfig(), validateRequiredEnvVars(), EnvValidationError class, validateConfig (+8 more)

### Community 9 - "Model & Effort Selection"
Cohesion: 0.3
Nodes (11): parseModelPrefix(), handleEffort(), handleModel(), validateMaxEffort(), getClaudeSettings(), isValidEffort(), isValidModel(), loadSettings() (+3 more)

### Community 10 - "Bot Simplification Plans"
Cohesion: 0.17
Nodes (13): Inline Claude Passthrough Routing, Simplify AppConfig to Slack+Claude, Simplify Bot Plan, Thread-scoped Gemini Chat History, Gemini Command Implementation Plan, @google/generative-ai SDK, Slack files.uploadV2, Gemini Draw Design (+5 more)

### Community 11 - "Debug & Model Config Plans"
Cohesion: 0.22
Nodes (10): DEBUG_CLAUDE Env Var, Claude Debug Log Design, claude_raw.log File, Claude Debug Log Plan, Inline opus/sonnet/haiku Prefix, max effort only valid for opus, Slack Model Config Design, data/settings.json Persistence (+2 more)

## Knowledge Gaps
- **81 isolated node(s):** `COMMAND_ALIASES map`, `downloadSlackImages`, `threadToSessionId (uuidv5)`, `handleCommands (list Claude slash cmds)`, `DailySnapshot type` (+76 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@anthropic-ai/claude-agent-sdk` connect `Claude SDK Integration` to `Model & Effort Selection`?**
  _High betweenness centrality (0.182) - this node is a cross-community bridge._
- **Why does `askClaude` connect `Claude SDK Integration` to `Doc-to-Source References`?**
  _High betweenness centrality (0.117) - this node is a cross-community bridge._
- **Are the 15 inferred relationships involving `getConfig()` (e.g. with `handleCommands()` and `handleCreateMilestone()`) actually correct?**
  _`getConfig()` has 15 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `handleClaude()` (e.g. with `getConfig()` and `createTracker()`) actually correct?**
  _`handleClaude()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `COMMAND_ALIASES map`, `downloadSlackImages`, `threadToSessionId (uuidv5)` to the rest of the system?**
  _81 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `GitLab Ops Plans` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Daily Report Handlers` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._