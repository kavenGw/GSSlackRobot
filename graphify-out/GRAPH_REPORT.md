# Graph Report - .  (2026-05-30)

## Corpus Check
- 11 files · ~40,587 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 368 nodes · 633 edges · 20 communities detected
- Extraction: 83% EXTRACTED · 17% INFERRED · 0% AMBIGUOUS · INFERRED: 105 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Claude SDK & Proxy Config|Claude SDK & Proxy Config]]
- [[_COMMUNITY_Gemini & Bot Simplification|Gemini & Bot Simplification]]
- [[_COMMUNITY_Milestone & Scheduler Commands|Milestone & Scheduler Commands]]
- [[_COMMUNITY_Config Bootstrap & Validation|Config Bootstrap & Validation]]
- [[_COMMUNITY_Command Routing & Handlers|Command Routing & Handlers]]
- [[_COMMUNITY_Command Handler Impls|Command Handler Impls]]
- [[_COMMUNITY_Jenkins & Slack Messaging|Jenkins & Slack Messaging]]
- [[_COMMUNITY_Model Config & Markdown|Model Config & Markdown]]
- [[_COMMUNITY_Env Validation Internals|Env Validation Internals]]
- [[_COMMUNITY_Daily Report Pipeline|Daily Report Pipeline]]
- [[_COMMUNITY_ModelEffort Switching|Model/Effort Switching]]
- [[_COMMUNITY_Claude Debug Log & Settings|Claude Debug Log & Settings]]
- [[_COMMUNITY_Singleton & Scheduler Guard|Singleton & Scheduler Guard]]
- [[_COMMUNITY_Project Documentation|Project Documentation]]
- [[_COMMUNITY_GitLab Service Layer|GitLab Service Layer]]
- [[_COMMUNITY_Jenkins Script Console|Jenkins Script Console]]
- [[_COMMUNITY_Config Schema|Config Schema]]
- [[_COMMUNITY_Config Loader|Config Loader]]
- [[_COMMUNITY_Env Validator File|Env Validator File]]
- [[_COMMUNITY_Jenkins Mention Bootstrap|Jenkins Mention Bootstrap]]

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
- **头脑风暴 trigger: spec→plan→code→help+docs** — spec_brainstormTrigger, plan_brainstormTrigger, index_brainstormTrigger, help_handleHelp, claudemd_slashEscape [EXTRACTED 0.85]
- **Claude passthrough: route→images→askClaude→log** — index_registerCommands, index_handleClaude, index_downloadSlackImages, claude_askClaude, logger_saveConversationLog [EXTRACTED 0.90]
- **Remove model/effort: spec→plan→askClaude** — spec_removeModelEffort, plan_removeModelEffort, claude_askClaude [EXTRACTED 0.85]

## Communities (20 total, 7 thin omitted)

### Community 0 - "Claude SDK & Proxy Config"
Cohesion: 0.05
Nodes (45): ClaudeImage type, CommandContext interface, ClaudeImage type, @anthropic-ai/claude-agent-sdk, askClaude (SDK streaming generator), buildMultimodalPrompt, Claude 完成通知 (@user ✅/❌), Slash 前缀转义 design rule (+37 more)

### Community 1 - "Gemini & Bot Simplification"
Cohesion: 0.06
Nodes (40): Delete GitLab/Jenkins/Webhook Files, Inline Claude Passthrough Routing, Simplify AppConfig to Slack+Claude, Simplify Bot Plan, Thread-scoped Gemini Chat History, Gemini Command Implementation Plan, @google/generative-ai SDK, Slack files.uploadV2 (+32 more)

### Community 2 - "Milestone & Scheduler Commands"
Cohesion: 0.11
Nodes (20): formatDate(), handleCreateMilestone(), loadKnownSessions(), registerCommands(), handleListMilestoneIssues(), getConfig(), registerJenkinsMention(), scheduleDailyReport() (+12 more)

### Community 3 - "Config Bootstrap & Validation"
Cohesion: 0.07
Nodes (37): App Bootstrap (app.ts), loadConfig() invocation in bootstrap, Single Instance Guard at Startup, Channel Purity (ops convention, not code-enforced), Config change sync rule (CLAUDE.md / setup-guide / .env.example), Design-then-plan docs workflow (specs/ -> plans/), Jenkins @channel Amplifier Pattern, Slack channels:history / message.channels scope requirement (+29 more)

### Community 4 - "Command Routing & Handlers"
Cohesion: 0.08
Nodes (36): ensureSingleInstance bootstrap, App Entry (app.ts), handleCommands (list Claude slash cmds), handleCreateMilestone, DailySnapshot type, generateDailyReport (block builder), handleDailyReport, handleResetDailyReport (+28 more)

### Community 5 - "Command Handler Impls"
Cohesion: 0.14
Nodes (23): formatSection(), handleCommands(), listMdFiles(), handleGeminiDraw(), handleGemini(), handleHelp(), CommandContext interface, downloadSlackImages() (+15 more)

### Community 6 - "Jenkins & Slack Messaging"
Cohesion: 0.06
Nodes (32): Claude done notification rationale, Command change sync checklist, Env validation mechanism, Message function selection rationale, CLAUDE.md project context, Slash prefix escape rationale, Claude integration doc, Flowchart doc (+24 more)

### Community 7 - "Model Config & Markdown"
Cohesion: 0.09
Nodes (25): commands/daily-report.ts, commands/gemini.ts, help command, commands/index.ts, commands/list-milestone-issues.ts, commands/list-milestones.ts, model command handler, data/settings.json (+17 more)

### Community 8 - "Env Validation Internals"
Cohesion: 0.17
Nodes (16): EnvValidationError, formatValidationErrors(), isValidToken(), isValidUrl(), validateConfig(), validateRequiredEnvVars(), EnvValidationError class, validateConfig (+8 more)

### Community 9 - "Daily Report Pipeline"
Cohesion: 0.29
Nodes (13): generateDailyReport(), handleDailyReport(), handleResetDailyReport(), snapshotPath(), todayStr(), yesterdayStr(), getLatestActiveMilestone(), getMilestoneByTitle() (+5 more)

### Community 10 - "Model/Effort Switching"
Cohesion: 0.3
Nodes (11): parseModelPrefix(), handleEffort(), handleModel(), validateMaxEffort(), getClaudeSettings(), isValidEffort(), isValidModel(), loadSettings() (+3 more)

### Community 11 - "Claude Debug Log & Settings"
Cohesion: 0.22
Nodes (10): DEBUG_CLAUDE Env Var, Claude Debug Log Design, claude_raw.log File, Claude Debug Log Plan, Inline opus/sonnet/haiku Prefix, max effort only valid for opus, Slack Model Config Design, data/settings.json Persistence (+2 more)

### Community 12 - "Singleton & Scheduler Guard"
Cohesion: 0.25
Nodes (8): Jenkins-cron Duplicate Execution Problem, Scheduler Guard Design, Singleton Guard Design, TCP Port EADDRINUSE Detection, Singleton Guard Plan, src/app.ts, src/utils/scheduler-guard.ts, src/utils/singleton.ts

## Knowledge Gaps
- **101 isolated node(s):** `COMMAND_ALIASES map`, `downloadSlackImages`, `threadToSessionId (uuidv5)`, `handleCommands (list Claude slash cmds)`, `DailySnapshot type` (+96 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `log (console logger object)` connect `Jenkins & Slack Messaging` to `Command Routing & Handlers`?**
  _High betweenness centrality (0.240) - this node is a cross-community bridge._
- **Why does `App Entry (app.ts)` connect `Command Routing & Handlers` to `Env Validation Internals`, `Claude SDK & Proxy Config`, `Jenkins & Slack Messaging`?**
  _High betweenness centrality (0.234) - this node is a cross-community bridge._
- **Are the 16 inferred relationships involving `getConfig()` (e.g. with `handleCommands()` and `handleCreateMilestone()`) actually correct?**
  _`getConfig()` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `handleClaude (Claude passthrough)` (e.g. with `loadKnownSessions / knownSessions` and `Claude 完成通知 (@user ✅/❌)`) actually correct?**
  _`handleClaude (Claude passthrough)` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `handleClaude()` (e.g. with `getConfig()` and `createTracker()`) actually correct?**
  _`handleClaude()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `COMMAND_ALIASES map`, `downloadSlackImages`, `threadToSessionId (uuidv5)` to the rest of the system?**
  _101 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Claude SDK & Proxy Config` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._