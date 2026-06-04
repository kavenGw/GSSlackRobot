# Graph Report - .  (2026-06-04)

## Corpus Check
- 0 files · ~99,999 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 408 nodes · 675 edges · 22 communities detected
- Extraction: 83% EXTRACTED · 17% INFERRED · 0% AMBIGUOUS · INFERRED: 113 edges (avg confidence: 0.8)
- Token cost: 0 input · 40,450 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Claude SDK & Multimodal Passthrough|Claude SDK & Multimodal Passthrough]]
- [[_COMMUNITY_Command Handlers|Command Handlers]]
- [[_COMMUNITY_Daily Report & Milestones|Daily Report & Milestones]]
- [[_COMMUNITY_App Bootstrap & Ops Conventions|App Bootstrap & Ops Conventions]]
- [[_COMMUNITY_App Entry & Command Registration|App Entry & Command Registration]]
- [[_COMMUNITY_GitLab & Webhook Plans|GitLab & Webhook Plans]]
- [[_COMMUNITY_Design Rationale Docs|Design Rationale Docs]]
- [[_COMMUNITY_Commands & Slack Formatting|Commands & Slack Formatting]]
- [[_COMMUNITY_Bootstrap, Scheduler & Logging|Bootstrap, Scheduler & Logging]]
- [[_COMMUNITY_CLAUDE.md Project Concepts|CLAUDE.md Project Concepts]]
- [[_COMMUNITY_Env Validation Internals|Env Validation Internals]]
- [[_COMMUNITY_Slack Messaging & Jenkins|Slack Messaging & Jenkins]]
- [[_COMMUNITY_Gemini & Simplification Plans|Gemini & Simplification Plans]]
- [[_COMMUNITY_Claude Debug & Model Config|Claude Debug & Model Config]]
- [[_COMMUNITY_Project Docs|Project Docs]]
- [[_COMMUNITY_GitLab Service|GitLab Service]]
- [[_COMMUNITY_Jenkins Service|Jenkins Service]]
- [[_COMMUNITY_Config Schema|Config Schema]]
- [[_COMMUNITY_Config Loader|Config Loader]]
- [[_COMMUNITY_Env Validator Module|Env Validator Module]]
- [[_COMMUNITY_Jenkins Mention Registration|Jenkins Mention Registration]]
- [[_COMMUNITY_Logger Module|Logger Module]]

## God Nodes (most connected - your core abstractions)
1. `getConfig()` - 32 edges
2. `ts()` - 15 edges
3. `registerCommands (app_mention router)` - 13 edges
4. `handleClaude (Claude passthrough)` - 11 edges
5. `handleClaude()` - 10 edges
6. `Plan: Safe Message Send` - 10 edges
7. `safePost()` - 9 edges
8. `CommandContext interface` - 9 edges
9. `generateDailyReport()` - 8 edges
10. `handleResetDailyReport()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `registerJenkinsMention()` --rationale_for--> `Slack channels:history / message.channels scope requirement`  [INFERRED]
  src/events/jenkins-mention.ts → docs/setup-guide.md
- `handleClaude (Claude passthrough)` --implements--> `Claude 完成通知 (@user ✅/❌)`  [INFERRED]
  src/commands/index.ts → CLAUDE.md
- `data/settings.json` --references--> `Technical reference`  [INFERRED]
  src/services/settings.ts → docs/technical-reference.md
- `GitLab event formatter` --references--> `GitLab ops doc`  [INFERRED]
  src/webhooks/gitlab.ts → docs/gitlab-ops.md
- `Delete GitLab/Jenkins/Webhook Files` --references--> `src/webhooks/server.ts`  [EXTRACTED]
  docs/plans/2026-02-24-simplify-bot-plan.md → src/webhooks/server.ts

## Hyperedges (group relationships)
- **Slack Message Sending Functions** — claudemd_safepost, claudemd_safeupdate, claudemd_postblocks, claudemd_safechat [EXTRACTED 0.85]
- **Streaming Output Segmentation Flow** — claudemd_safeupdate, claudemd_segment_tracker, claudemd_split_to_blocks, claudemd_throttle, claudemd_message_limit [INFERRED 0.80]
- **Claude Passthrough Flow** — claudemd_handle_claude, claudemd_claude_service, claudemd_slash_escape, claudemd_setting_sources, claudemd_completion_notify [EXTRACTED 0.85]

## Communities (23 total, 8 thin omitted)

### Community 0 - "Claude SDK & Multimodal Passthrough"
Cohesion: 0.05
Nodes (45): ClaudeImage type, CommandContext interface, ClaudeImage type, @anthropic-ai/claude-agent-sdk, askClaude (SDK streaming generator), buildMultimodalPrompt, Claude 完成通知 (@user ✅/❌), Slash 前缀转义 design rule (+37 more)

### Community 1 - "Command Handlers"
Cohesion: 0.11
Nodes (31): formatSection(), handleCommands(), listMdFiles(), handleGeminiDraw(), handleGemini(), handleHelp(), CommandContext interface, downloadSlackImages() (+23 more)

### Community 2 - "Daily Report & Milestones"
Cohesion: 0.15
Nodes (27): formatDate(), handleCreateMilestone(), generateDailyReport(), handleDailyReport(), handleResetDailyReport(), snapshotPath(), todayStr(), yesterdayStr() (+19 more)

### Community 3 - "App Bootstrap & Ops Conventions"
Cohesion: 0.07
Nodes (37): App Bootstrap (app.ts), loadConfig() invocation in bootstrap, Single Instance Guard at Startup, Channel Purity (ops convention, not code-enforced), Config change sync rule (CLAUDE.md / setup-guide / .env.example), Design-then-plan docs workflow (specs/ -> plans/), Jenkins @channel Amplifier Pattern, Slack channels:history / message.channels scope requirement (+29 more)

### Community 4 - "App Entry & Command Registration"
Cohesion: 0.08
Nodes (36): ensureSingleInstance bootstrap, App Entry (app.ts), handleCommands (list Claude slash cmds), handleCreateMilestone, DailySnapshot type, generateDailyReport (block builder), handleDailyReport, handleResetDailyReport (+28 more)

### Community 5 - "GitLab & Webhook Plans"
Cohesion: 0.07
Nodes (35): Delete GitLab/Jenkins/Webhook Files, create-milestone Command, daily-report Command, daily-report Scheduler (setTimeout), GitLab Commands Migration Plan, list-issues Command, list-milestones Command, Express Choice Rationale (+27 more)

### Community 6 - "Design Rationale Docs"
Cohesion: 0.06
Nodes (32): Claude done notification rationale, Command change sync checklist, Env validation mechanism, Message function selection rationale, CLAUDE.md project context, Slash prefix escape rationale, Claude integration doc, Flowchart doc (+24 more)

### Community 7 - "Commands & Slack Formatting"
Cohesion: 0.09
Nodes (25): commands/daily-report.ts, commands/gemini.ts, help command, commands/index.ts, commands/list-milestone-issues.ts, commands/list-milestones.ts, model command handler, data/settings.json (+17 more)

### Community 8 - "Bootstrap, Scheduler & Logging"
Cohesion: 0.13
Nodes (9): loadKnownSessions(), registerCommands(), registerJenkinsMention(), scheduleDailyReport(), loadSettings(), ts(), ensureSingleInstance(), handleGitLabEvent() (+1 more)

### Community 9 - "CLAUDE.md Project Concepts"
Cohesion: 0.11
Nodes (22): app.ts Entry Point, 头脑风暴 Brainstorming Trigger, Claude Agent SDK Integration, services/claude.ts query() Streaming, Command Routing, Config/Command Change Sync Rule, downloadSlackImages, Environment Variable Validation (+14 more)

### Community 10 - "Env Validation Internals"
Cohesion: 0.17
Nodes (16): EnvValidationError, formatValidationErrors(), isValidToken(), isValidUrl(), validateConfig(), validateRequiredEnvVars(), EnvValidationError class, validateConfig (+8 more)

### Community 11 - "Slack Messaging & Jenkins"
Cohesion: 0.13
Nodes (16): Slack Bolt Event/Type Quirks, Claude Completion Notification, Daily Report Scheduler, Jenkins @channel Repost, Jenkins Cron Scheduler, Jenkins Integration, SLACK_MAX_BLOCK_TEXT Limit, postBlocks Function (+8 more)

### Community 12 - "Gemini & Simplification Plans"
Cohesion: 0.17
Nodes (13): Inline Claude Passthrough Routing, Simplify AppConfig to Slack+Claude, Simplify Bot Plan, Thread-scoped Gemini Chat History, Gemini Command Implementation Plan, @google/generative-ai SDK, Slack files.uploadV2, Gemini Draw Design (+5 more)

### Community 13 - "Claude Debug & Model Config"
Cohesion: 0.22
Nodes (10): DEBUG_CLAUDE Env Var, Claude Debug Log Design, claude_raw.log File, Claude Debug Log Plan, Inline opus/sonnet/haiku Prefix, max effort only valid for opus, Slack Model Config Design, data/settings.json Persistence (+2 more)

## Knowledge Gaps
- **114 isolated node(s):** `COMMAND_ALIASES map`, `downloadSlackImages`, `threadToSessionId (uuidv5)`, `handleCommands (list Claude slash cmds)`, `DailySnapshot type` (+109 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `log (console logger object)` connect `Design Rationale Docs` to `App Entry & Command Registration`?**
  _High betweenness centrality (0.195) - this node is a cross-community bridge._
- **Why does `App Entry (app.ts)` connect `App Entry & Command Registration` to `Claude SDK & Multimodal Passthrough`, `Env Validation Internals`, `Design Rationale Docs`?**
  _High betweenness centrality (0.190) - this node is a cross-community bridge._
- **Are the 16 inferred relationships involving `getConfig()` (e.g. with `handleCommands()` and `handleCreateMilestone()`) actually correct?**
  _`getConfig()` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `handleClaude (Claude passthrough)` (e.g. with `loadKnownSessions / knownSessions` and `Claude 完成通知 (@user ✅/❌)`) actually correct?**
  _`handleClaude (Claude passthrough)` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `handleClaude()` (e.g. with `getConfig()` and `createTracker()`) actually correct?**
  _`handleClaude()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `COMMAND_ALIASES map`, `downloadSlackImages`, `threadToSessionId (uuidv5)` to the rest of the system?**
  _114 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Claude SDK & Multimodal Passthrough` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._