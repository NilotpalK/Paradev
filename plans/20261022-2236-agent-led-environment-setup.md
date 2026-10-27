# Agent-led cloud environment setup

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from `AGENTS.md` (root), `apps/desktop/AGENTS.md`, `packages/trpc/AGENTS.md`, `.agents/skills/db-migrations/SKILL.md`, and the ExecPlan template. The agreed design, with high-fidelity mocks, is the Superset page "Creating a cloud environment: proposed flow" (https://app.superset.sh/page/creating-a-cloud-environment-proposed-flow-rmvle1). Its source HTML is `plans/environment-setup-flow.html`.


## Purpose / Big Picture

A cloud environment is the definition a cloud workspace boots from: which GitHub repositories it checks out, which secrets it gets, which region it runs in, and (once set up) a saved snapshot of a machine with everything installed. Today a person fills in a form and gets an environment with nothing installed; making it useful takes a second, hidden step (run an agent in a cloud workspace, then "Save as environment"). The server also silently creates "default environments" that nobody set up.

After this change the flow is:

1. In the new-workspace screen, the environment picker groups environments into "Linked to <project>" and "Other environments", with "Create environment" and "Manage environments" at the bottom. Settings → Environments has the same "Add environment" entry.
2. If the organization has no Superset GitHub App, or the person hasn't connected their own GitHub account, a "Connect GitHub" dialog comes first. The App is required; the personal account is recommended and can be skipped.
3. "Create a cloud environment" shows "Connected to GitHub as <login>", a repository source dropdown (all repositories, one entry per installed GitHub account or org, and "Connect GitHub org"), and a searchable repository list. "Get started" creates the environment (visible only to the creator), links it to the current project, and opens a dedicated local session where an agent runs the `superset:environment` skill.
4. The agent does intake, sets variables, boots a cloud box, gets the project running, saves checkpoints, and finally sets the chosen visibility. The chat shows an environment card; the card and a header button open a live environment pane beside the chat.

To see it working: open the desktop app, open the new-workspace screen with the Cloud host, pick "Create environment" from the environment picker, select repositories, click "Get started", and watch the setup session.


## Assumptions

Cloud environments are internal-only as of 2026-10-22, so this plan breaks released desktop builds for environment procedures without compat shims (the user said to "cut deep"). This does not extend to GitHub integration procedures, which the web app and released clients use for other features: there, existing procedures keep working and new ones are added beside them.

The setup agent runs locally, never inside a sandbox, so it has the person's full CLI authentication. `superset environments *` commands stay hidden inside sandboxes.

The agent may handle secret values itself, always through `--env-file` or stdin, never `--body`.

There is no draft state. "Get started" creates a real environment with `scope: personal`.


## Open Questions

None blocking. Q-session-header (Milestone 7) has an investigation step: where to record which environment a local setup session belongs to.


## Progress

- [x] (2026-10-22 22:36Z) Discovery, design discussion, first plan.
- [x] (2026-10-22 23:10Z) Verification pass of server, CLI and desktop facts.
- [x] (2026-10-23 00:50Z) Page with high-fidelity mocks published (v3); flow agreed; all "proposed" items accepted; multi-org GitHub included.
- [x] (2026-10-23 01:20Z) Milestone 1: remove implicit default environments (cf72a08a).
- [x] (2026-10-23 01:45Z) Milestone 2: schema; migrations 0164 and 0165 applied to this workspace's Neon branch only (016eba53, cc7af4e8).
- [x] (2026-10-23 02:00Z) Milestone 3: link procedures (afa6db5c) and grouped picker (e648509a).
- [x] (2026-10-23 02:30Z) Milestone 4: links, view, pane, chat cards, route, web redirect, CLI URL (f45f9ab3).
- [x] (2026-10-23 02:40Z) Milestone 5: skill (5a379344).
- [x] (2026-10-23 03:10Z) Milestone 6: create flow and launch; dialog reduced to promote (241f7e96).
- [x] (2026-10-23 03:20Z) Milestone 7: setup session header (f4964843).
- [x] (2026-10-23 03:45Z) Milestone 8: several GitHub installations per organization (c0c9366d).
- [x] (2026-10-23 05:30Z) End-to-end verification in the dev desktop app over CDP (renderer :3005, CDP :9333, API :3001, web :3000, this workspace's Neon branch). See Outcomes.
- [x] (2026-10-23 03:40Z) Recorded walkthrough of every screen and button (https://app.superset.sh/page/cloud-environment-setup-recorded-walkthrough-my13jb). Fixes found while recording: dialog overflow and stray footer note (750c5446), setup opening as a terminal and picked repositories scrolling away (e8c70982), primary repository as its own step (7624e23f), Starting… label (c3956474).
- [x] (2026-10-23 21:00Z) Archive asks first, in Settings and the environment view, and says it is permanent for everyone (e9933eec).
- [x] (2026-10-23 22:00Z) New-workspace pills remember every choice: checkout, the last project per target (device, cloud, including No project), and cloud environment and machine size per project, capped at 50. Cloud base branch keyed by environment. Cloud without a project is allowed (6625f08b). Recorded with 19 checks: https://app.superset.sh/page/new-workspace-pills-what-they-remember-3f6xax
- [x] (2026-10-23 22:30Z) Pills reserve their width, so the row never shifts (df4b0cc0, 3afd77bd).
- [x] (2026-10-23 23:10Z) Unique default names and the environment limit shown before picking repositories, through a new `environment.capacity` query (50c9e74f). Recorded as walkthrough scene 8.
- [ ] Follow-ups (not here): checkpoint history of 3–5 with restore; `superset workspaces exec`; mobile setup flow.


## Surprises & Discoveries

- Only the desktop new-workspace form relies on the default-environment fallback. Every other caller of `cloudWorkspace.create` (Run in Workspace, mobile, voice, automations, MCP, SDK, CLI) already sends `environmentId` and errors client-side when none exists.
- Repositories freeze at the first checkpoint: `environment.update` rejects `repositoryIds` unless `sourceKind === "image"` (`packages/trpc/src/router/environment/environment.ts`, `repositoriesFrozen`).
- `environments replace` works from the environment's own setup box, including an image-backed one. Promote snapshots the box (ending its session) and restarts it only if it was running; the `cloud_workspaces` row is untouched.
- `superset environments secrets set` reads a value from stdin when `--body` is absent, and `--env-file` imports a `.env`, skipping reserved and agent-credential keys.
- Cloud `superset workspaces create` returns while the box is provisioning; `superset workspaces get <id>` reports `status` without waking it.
- No one-shot exec exists in host-service; `superset terminals create|send|read|wait --workspace <cloudId>` reach a cloud box today.
- Chat's `openPage` already calls `runUrlLinkAction`; only the link parsers differ between chat (`parseSupersetAppLink`) and terminal (`parseSupersetPageUrl`).
- Host-service broadcasts `"agent:lifecycle"` with `eventType === "Stop"` when an agent finishes a turn; `usePageWatchersForPage` already invalidates cloud queries on it.
- The bundled `superset` plugin's skills reach every local agent through desktop/CLI builds; it is not a marketplace entry, so `superset plugins publish` does not apply. Dev testing: `bun run dev:skills` → `/superset-dev:environment`.
- `github_installations` is unique on `organization_id`, and the install callback upserts on it, so installing the App on a second GitHub account replaces the first. 16 files read `githubInstallations`.
- The desktop has no GitHub App install button and no checkbox/multi-select repository list today. `EnvironmentRepositoryPicker` uses chips plus a Command popover; `GitHubRepositoryPicker` uses a Command list with a check on the selected row.
- A personal GitHub connection makes boxes push and open PRs as the person; without it the App's installation token is injected at the egress firewall and PRs are opened by the App.
- `superset pages comments list` refuses inside a cloud workspace ("A cloud workspace cannot call pageComment.list").
- Projects are host-local; the cloud `v2_projects` table is being retired. The first migration's foreign key to it was wrong, so 0165 turns `environment_projects.project_id` into a plain host project key. "Linked to this project" therefore also includes environments that open on the project's repository, so a teammate's checkout of the same repository still finds them.
- The shell exports the first `DATABASE_URL_UNPOOLED` from `.env`, which is not this workspace's Neon branch; `drizzle-kit migrate` must be given the branch URL explicitly. The dev API reloads `.env` with override and does use the branch.
- `displayText` returns nothing for user messages; the setup header reads the first message with `userMessageText`.
- The web GitHub page only offered Disconnect once connected; it now offers Connect another account, which is where the desktop's "Connect GitHub org" leads.
- A box carries a single GitHub token, so a box's installation token covers the primary repository's installation only; repositories on another GitHub account clone through the creator's personal connection.
- The box has 8 GB; the start hook skips the desktop dev build below 12 GB.


## Decision Log

- Decision: setup runs in a dedicated local session (no project), not in a cloud sandbox. Rationale: full CLI auth, local `.env` files, and the CLI already reaches the box. Date/Author: 2026-10-22 / Satya + agent.
- Decision: no draft state; "Get started" creates the environment as `personal`, links it to the current project, and the skill sets the final visibility. Rationale: one source of truth; resuming needs only the environment and chat. Date/Author: 2026-10-22–23 / Satya.
- Decision: remove default environments; `cloudWorkspace.create` requires `environmentId`; no compat for released clients. Date/Author: 2026-10-22 / Satya.
- Decision: the agent handles secret values, through `--env-file` or stdin only. Date/Author: 2026-10-22 / Satya (scope), agent (mechanism).
- Decision: the environment pane opens only from `/environments/<id>` links (chat, terminal, browser, header button); chat unfurls the link as a chip and a card. Environment links reuse `openPage`/`runUrlLinkAction` (renamed `openAppLink`). Date/Author: 2026-10-22 / Satya + agent.
- Decision: explicit project links in a new `environment_projects` table; the picker groups by them. Rationale: repository matching can't express "use this environment for that project". Date/Author: 2026-10-23 / Satya (accepted proposal).
- Decision: GitHub App required, personal account recommended. A "Connect GitHub" dialog appears only when either is missing, using the Settings → Connections row style. Date/Author: 2026-10-23 / Satya.
- Decision: the repository list uses the app's Command list style; the repository source dropdown lists installed accounts and "Connect GitHub org". Multiple installations per organization are in scope (Milestone 8). Date/Author: 2026-10-23 / Satya.
- Decision: the setup session has a header ("Cloud environment setup" + Edit environment). Date/Author: 2026-10-23 / Satya (accepted proposal).
- Decision: Settings "Add environment" uses the same flow with no project; "Edit" opens the environment view; `EnvironmentEditorDialog` shrinks to promote only. Date/Author: 2026-10-23 / Satya (accepted proposal).
- Decision: work happens on this branch in milestone commits. Schema changes (Milestone 2) are separate commits so they can ship as their own PR, per the db-migrations checklist ("No tRPC input or output change in the same PR"). Date/Author: 2026-10-23 / Satya + agent.
- Decision: checkpoint history and `workspaces exec` are follow-ups. Date/Author: 2026-10-22 / Satya.


## Outcomes & Retrospective

Verified end to end in the running dev desktop app, driven over CDP with real mouse and keyboard input, against the dev API on this workspace's Neon branch:

- New-workspace screen, Cloud host: the picker has no Default; it shows "Linked to <project>" (empty state, then the new environment after Get started), "Other environments", Create and Manage.
- Create environment with both GitHub connections present goes straight to repository picking: "Connected to GitHub as <login>", the source dropdown (All repositories, the installed account, Connect GitHub org), the command-list repository picker with Primary and a check, "1 selected".
- Get started created the environment (personal, base image, region, repository, config repository, linked to the project's key), opened a local session "Set up team-plugins" and delivered the setup prompt with the environment URL.
- The environment view from Settings → Edit: visibility change round-trips, linked project named after its repository.
- Ctrl+click on the environment URL in a terminal opens the Environment pane beside it; the pane survives a reload; Archive from the pane asks to confirm, closes the pane, and archives the row.
- Settings → New environment opens the same dialog without project linking.
- The web route /environments/<id> answers 200 with the superset:// deep link.

Found and fixed during the run: the web proxy sent the environment deep link to sign-in; the view named cloud stand-in projects "Project on another device"; the agent-turn refresh hook required a host-service provider even when disabled.

Not verified end to end, and why:

- The Connect GitHub step: this account has both connections, so the flow skipped it as designed.
- The chat surface (environment card, setup header): ACP chat is behind a PostHog flag that is not loaded in this dev renderer, so sessions open in the terminal. Covered by component tests (EnvironmentLinkCard, SetupSessionHeader, setupEnvironmentLink).
- The agent running the skill: Claude Code on this box is not logged in. This also kept the run from booting real cloud boxes.
- Several GitHub installations: needs a second GitHub account to install the App on; covered by typecheck and the existing integration tests only.
- The migrations were applied to this workspace's Neon branch only; production gets them through the deploy flow.

Test suites: desktop 8609, trpc 687, cli 440, api 231, i18n 165, web 84 tests pass; typecheck clean for trpc, desktop, web, cli, api, auth; biome clean on all changed files; check:i18n and check:plugins pass.

## Context and Orientation

Affected apps: desktop (`apps/desktop`), api (`apps/api`, GitHub install callback and sync jobs), web (`apps/web`, one redirect route). Packages: `packages/db` (schema + migration), `packages/trpc` (procedures), `packages/cli`, `packages/shared`, `packages/i18n`, and the bundled plugin `plugins/superset`.

Terms. A "tRPC procedure" is a typed API endpoint in `packages/trpc/src/router/`; the desktop calls them through `cloudTrpc`, the CLI through `ctx.api`. An "environment" is a row in `environments` (`packages/db/src/schema/schema.ts`) with ordered `environment_repositories` (the first is "primary") and encrypted `environment_secrets`; `sourceKind` is `image` or `fork`, and a fork boots from a "golden" snapshot named in `sourceRef`. "Promote" (`environment.promote`, CLI `environments save|replace`) snapshots a `ready` cloud workspace into a golden; a "checkpoint" is one `replace`. A "pane" is a view in a desktop v2 workspace, registered in `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/usePaneRegistry.tsx` (below, `V2` is `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId` and `CS` is `V2/hooks/usePaneRegistry/components/ChatSession`). "Unfurl" is rendering a chat link as an icon chip (`CS/utils/linkUnfurl/linkUnfurl.ts`) or a card (`CS/components/PageLinkCard`). A "workspace event" is a host-service push, subscribed with `useWorkspaceEvent(name, workspaceId, cb)`. A "deep link" is `superset://<path>`, turned into a renderer navigation by `processDeepLink` in `apps/desktop/src/main/index.ts`; the web app forwards with `DeepLinkRedirect` (`apps/web/src/components/DeepLinkRedirect`). The "GitHub App installation" is a `github_installations` row (`packages/db/src/schema/github.ts`), created by `apps/api/src/app/api/github/callback/route.ts` after `/api/github/install`; repositories are synced into `github_repositories`. The "personal GitHub connection" is `github_user_connections`, connected through `githubUser.connect` (Settings → Connections).

Key existing files: the new-workspace screen `apps/desktop/src/renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/NewWorkspaceScreen/NewWorkspaceScreen.tsx`, its submit hook `.../DashboardNewWorkspaceForm/PromptGroup/hooks/useSubmitWorkspace/useSubmitWorkspace.ts`, the picker `.../PromptGroup/components/EnvironmentPickerPill/EnvironmentPickerPill.tsx`, the dialog `apps/desktop/src/renderer/routes/_authenticated/components/EnvironmentEditorDialog/`, Settings `apps/desktop/src/renderer/routes/_authenticated/settings/environments/`, local workspace creation `apps/desktop/src/renderer/stores/workspace-creates/useWorkspaceCreates.ts` and `apps/desktop/src/renderer/hooks/useCreateAgentSession/useCreateAgentSession.ts`.


## Plan of Work

### Milestone 1: no implicit environments

Server: in `packages/trpc/src/router/cloud-workspace/cloud-workspace.ts`, drop `repositoryId` from `create`, make `environmentId` required, delete the fallback. Delete `packages/trpc/src/router/environment/default-environment.ts` and its test. Update `packages/sdk/api.md`, `docs/cloud-sandbox-acceptance.md`, `apps/mobile/plans/20260817-cloud-workspaces.md` where they describe the old input. Leave `packages/sandbox/src/environments/release.ts` (internal release environment).

Desktop: in `useSubmitWorkspace.ts` remove the `repositoryId` parameter and branch, the stale-pick fallback, and the post-create `environment.list` invalidation that existed for it; a missing environment blocks with the existing "Add an environment in Settings before creating a cloud workspace". In `NewWorkspaceScreen.tsx`, delete `defaultRepository` and its argument; `defaultHint` becomes `resolvedEnvironment?.name ?? null`. In `EnvironmentPickerPill.tsx`, delete the "Default" option.

Translations: add the missing `serverError.environment.*` rows (`workspaceNotReady`, `changedDuringPromote`, `organizationMismatch`, `personalNotCreator`, `environmentNotFound`) to `packages/i18n/src/server-errors.ts`; run `bun run check:i18n`; translate every locale.

Acceptance: `bun test packages/trpc` and `bun run typecheck` pass; the picker has no "Default".

### Milestone 2: schema (separate commits; own PR)

In `packages/db/src/schema/schema.ts` add `environment_projects` (`environment_id` → `environments.id` on delete cascade, `project_id` → `v2_projects.id` on delete cascade, `organization_id`, `created_at`; unique on (`environment_id`, `project_id`); index on `project_id`). In `packages/db/src/schema/github.ts`, replace `unique("github_installations_org_unique").on(organizationId)` with a plain index on `organization_id` (installation_id stays unique). Generate with `bunx drizzle-kit generate --name="environment_projects_and_multi_github_installations"` from `packages/db` against a fresh Neon branch, apply only to that branch, and clear the safety checklist (both tables are small; no hot tables; say in the PR that no load rehearsal was needed and why).

### Milestone 3: project links and picker

Procedures in `packages/trpc/src/router/environment/environment.ts`: `linkProject({ environmentId, projectId })`, `unlinkProject(...)` (same visibility rules as `update`; project must be in the same organization), and `list`/`get` return `projectIds`. `create` accepts optional `projectId` and links in the same transaction.

Picker: `EnvironmentPickerPill` renders `CommandGroup heading="Linked to <project>"` (environments whose `projectIds` include the selected project; else "No environments are linked to this project yet."), `CommandGroup heading="Other environments"` (every other startable environment), then "Create environment" and "Manage environments" (navigates to `/settings/environments`). `NewWorkspaceScreen` auto-selects the first linked environment instead of the first repository match; `environmentsForRepository` is deleted if unused.

### Milestone 4: links, view, pane, unfurl

One URL: `${NEXT_PUBLIC_WEB_URL}/environments/<id>`. Move `CS/utils/supersetAppLink` to `apps/desktop/src/renderer/lib/supersetAppLink/` and add `{ kind: "environment"; environmentId }`. `runUrlLinkAction` uses `parseSupersetAppLink`; `environment` opens the environment pane like a page. Rename chat `openPage` → `openAppLink` along `ChatPane` → `AcpChatPane` → `SessionView` → `ChatPaneActionsProvider`; `ChatLink` routes `environment` through it; `linkUnfurl.ts` labels it.

`EnvironmentView` (`apps/desktop/src/renderer/routes/_authenticated/components/EnvironmentView/`): header (name, visibility badge, created-by), setup-running notice when a setup session is linked, property rows in the `EnvironmentPropertyRow` style (Visible to, Region, Repositories, Projects with link/unlink, Snapshot), Variables list (key + Set/Missing, never values), Archive. With a `workspaceId`, it invalidates on `"agent:lifecycle"` Stop. Pane kind `"environment"` (`EnvironmentPaneData { environmentId }`) registered in `usePaneRegistry.tsx`, opened by `V2/utils/openEnvironmentPaneInStore`, not in `paneOptions.ts`. `CS/components/EnvironmentLinkCard` modeled on `ChatPageCard`, mounted next to `PageLinkCard`. Desktop route `_dashboard/environments/$environmentId/page.tsx`; web `apps/web/src/app/environments/[id]/page.tsx` with `DeepLinkRedirect`. `superset environments create` prints the URL (`getWebUrl()` in `packages/cli/src/lib/auth.ts`).

### Milestone 5: skill

`plugins/superset/skills/environment/SKILL.md`: intake (repos confirmed before the first checkpoint), variables via `--env-file`/stdin, boot (`workspaces create --environment`, poll `workspaces get` for `ready`, work through `terminals`), write `.superset/config.json`, checkpoint with `environments replace --yes` after warning, finish (`environments update --scope`, `workspaces archive`, summary). If invoked with an environment ID, it continues that environment; otherwise it checks `environments list` for one to resume. Delete `ENVIRONMENT_ONBOARDING_PROMPT` once unused.

### Milestone 6: dialogs and launch

`ConnectGitHubDialog`: two rows in the Settings → Connections style. App row: "Install" opens `${NEXT_PUBLIC_API_URL}/api/github/install?organizationId=…` in the browser; refetch `integration.github.getInstallation` on window focus. Account row: `githubUser.connect` URL in the browser; refetch `githubUser.get` on focus. Continue requires the App. Shown only when either is missing.

`CreateEnvironmentDialog`: shell like today's dialog; "Connected to GitHub as <login>" (or "Pushes as the Superset app" + Connect); repository source trigger (FormPickerTrigger + DropdownMenu: All repositories, one entry per installation, "Connect GitHub org" → install URL); Command list of repositories with a check on selected rows and "Primary" on the first; "Missing a repository? Configure access" + Refresh (`triggerSync`). Get started: `environment.create({ organizationId, name: first repo name, repositoryIds, hooksRepositoryId: first, scope: "personal", projectId })`, then launch the session through an extended `useCreateAgentSession({ prompt, agent: "claude", preferChat: true })` (chat surface helper shared with `useSubmitWorkspace`), close the modal, navigate.

Entry points: `EnvironmentPickerPill` "Create environment"; Settings → Environments "Add environment" (no project); Settings "Edit" navigates to `/environments/$id`. Delete the create branch, region select and repository picker from `EnvironmentEditorDialog`; it stays for `SaveAsEnvironmentMount` (promote).

### Milestone 7: session header

Investigate where a local session can carry its environment ID (host-service workspace metadata, a tag, or the session's launch record) and pick the smallest option that survives restarts. Render the header in `SessionView` (or `ChatPane`) when present: "Cloud environment setup · <name>" and "Edit environment" opening the pane.

### Milestone 8: multiple GitHub installations

`apps/api/src/app/api/github/callback/route.ts` inserts or updates by `installation_id` instead of `organization_id`; the cross-organization guard stays. Add `integration.github.listInstallations`; keep `getInstallation` (first installation) for released clients. Repository sync, webhooks, suspension, disconnect, `find-installed-repository`, `installationTokenFor`, `list-branches` and `connection-status` work per installation. The source dropdown filters by installation.


## Concrete Steps

From the repo root:

    bun install
    bun test packages/trpc
    bun test apps/desktop
    bun run typecheck
    bun run lint
    bun run check:i18n      # then fill each locales/<locale>/messages.po
    bun run dev:skills      # Milestone 5: /superset-dev:environment


## Validation and Acceptance

Run `bun run dev:desktop` against an org with cloud access. Pick "Create environment" in the new-workspace picker: with GitHub fully connected the Create dialog opens; with either connection missing, Connect GitHub opens first. Select two repositories and click Get started: a local session opens with the header, the agent posts an environment card, and the pane fills in as it works. Back in the new-workspace screen for the same project, the environment sits under "Linked to <project>". Use `.agents/skills/cdp-verification/SKILL.md` for the desktop checks and record what was observed.


## Idempotence and Recovery

Code steps are ordinary edits. The skill resumes an existing environment instead of creating a second. A failed `replace` keeps the previous golden. The migration only adds a table and swaps a unique constraint for an index on a small table; reverting is a follow-up migration.


## Interfaces and Dependencies

    // V2/types.ts
    export interface EnvironmentPaneData { environmentId: string }

    // apps/desktop/src/renderer/lib/supersetAppLink/supersetAppLink.ts
    export type SupersetAppLink =
        | { kind: "page"; slug: string }
        | { kind: "environment"; environmentId: string }
        | ...existing kinds;

    // environment router
    linkProject({ environmentId: string, projectId: string }): void
    unlinkProject({ environmentId: string, projectId: string }): void
    create({ ...existing, projectId?: string })
    list/get → rows include projectIds: string[]

    // cloudWorkspace.create: environmentId required; repositoryId removed.


## Revision notes

2026-10-22 23:10Z: verification pass; Q1 resolved.
2026-10-23 01:00Z: rewritten for the agreed flow from the page (Connect GitHub dialog, Create dialog with repository source, Get started creates + links + launches, project links, session header, Settings reuse) and for multi-installation GitHub support. Previous Q2/Q3 resolved by the flow. Milestones renumbered.
2026-10-23 03:50Z: implementation complete through Milestone 8; recorded discoveries (host project keys, migration targeting, single box token).
2026-10-23 05:30Z: end-to-end verification recorded in Outcomes, with the gaps that this environment could not exercise.
2026-10-23 03:45Z: recording pass; added the choose-primary step at the user's request and the fixes the recordings exposed. Suggestions left open: confirm archive in the Settings list, default names for repeated setups, warn about the environment limit up front.
