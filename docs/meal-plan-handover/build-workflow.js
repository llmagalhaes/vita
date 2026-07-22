export const meta = {
  name: 'meal-workout-plan-build',
  description: 'Opus builders execute the meal/workout-plan tickets under Fable team-lead supervision (amend specs per CEO, build, review, fix)',
  phases: [
    { title: 'Amend', detail: 'Fable leads bake CEO simplifications into specs/tickets; backend lead also ships the v0.6.0 contract (BE-036)' },
    { title: 'Build', detail: 'Opus builders: backend BE-037..040, app APP-075..081, gates green' },
    { title: 'Review', detail: 'Fable leads adversarially review the diffs vs spec + handoff' },
    { title: 'Fix', detail: 'Opus builders fix critical findings, gates re-run (only if needed)' },
  ],
}

const REPO = '/Users/llmagalhaes/workspace/vita'

const AMENDMENTS = `
CEO AMENDMENTS (2026-07-22, binding — they OVERRIDE the specs where they conflict):
A1. Portions overlay: NO encryption. Portions are not sensitive. plan_portions stores plaintext
    (JSON column or columns); drop the per-user-DEK/AAD/crypto-shred wiring for it. Account
    deletion cleans it via plain FK cascade. Simplifies BE-038 substantially.
A2. NO legacy/backfill work: we are NOT in production for real users. Drop the deterministic
    on-read id backfill entirely (BE-037): ids are assigned at save/parse time only. Existing DB
    rows may be invalidated; destructive migrations are acceptable; dropping and recreating the
    database is explicitly allowed.
A3. Workout/program data touched this round: NO encryption required. Where this feature's code
    path crosses program/workout persistence, plaintext is fine and simplifying existing
    encryption there is allowed if it is the shortest path. Do NOT launch an unrelated
    repo-wide decrypt sweep. Meal/health entries outside this feature keep current behavior.
A4. The handoff §1.2 nutrition table is an EXAMPLE, not product truth: all nutrition values come
    from Claude parse estimates at import; totals are ALWAYS computed from per-item data.
    Fixtures may keep the table as deterministic golden TEST input (asserts computed from the
    fixture), but no product code or ticket treats 1,756.2 or any table number as a constant.
A5. Portion overrides across document edits: an edit touches ONLY the edited item — every other
    item keeps its override. Removed item -> override pruned. Edited item -> its override resets
    (its quantity/bounds changed). Re-import (new plan version) still resets all (DESIGN-SPEC).
A6. Portion modal KEEPS the numeric exact-input field alongside the slider (dual-input
    philosophy) — confirmed.
A7. The Eating Plan screen KEEPS the existing Edit button/mode alongside portion taps — confirmed.
A8. iOS workout history shows captured workouts only this round — approved.
A9. Muscle-map opacity: the deterministic muscleRoles rule stands; deviation from the handoff's
    hand-tuned calves/core values is approved. No per-muscle override table.
`

const COMMON = `
Repo: ${REPO}. Feature docs: ${REPO}/docs/meal-plan-handover/ (DESIGN-SPEC.md = approved
architecture; backend-spec.md / app-spec.md = build-ready team specs; the design handoff
"design_handoff_vita_v2 4/SPEC - Eating Plan & Training Program.md" = visual source of truth).
${AMENDMENTS}
GIT RULES (hard): NEVER run state-changing git (add/commit/checkout/reset/stash/push) — the
orchestrator commits. Read-only git (status/diff/log/show) is allowed.
Product philosophy: no goals/scores/streaks/advice; "~" on estimates; sources credited; calm copy.
Asana tool loading example: ToolSearch "select:mcp__5414d5a5-7de9-44ab-b0e3-a07cddc0676f__update_tasks,mcp__5414d5a5-7de9-44ab-b0e3-a07cddc0676f__add_comment".
Ticket gids: BE-036=1216780755098294 BE-037=1216780754823617 BE-038=1216780754977731
BE-039=1216780941788174 BE-040=1216780941323178 BE-041=1216780941707846
APP-075=1216780941484321 APP-076=1216780758083108 APP-077=1216780941466263
APP-078=1216780941360390 APP-079=1216781004494493 APP-080=1216780758004082 APP-081=1216780754495068
`

const AMEND_SCHEMA = {
  type: 'object',
  required: ['team', 'amendedFiles', 'ticketsUpdated', 'buildBrief', 'notes'],
  properties: {
    team: { type: 'string', enum: ['backend', 'app'] },
    amendedFiles: { type: 'array', items: { type: 'string' } },
    ticketsUpdated: { type: 'array', items: { type: 'string' } },
    contractWritten: { type: 'boolean' },
    buildBrief: { type: 'string', description: 'concise directive for the Opus builder: ticket order, key simplifications, gotchas' },
    notes: { type: 'string' },
  },
}

const BUILD_SCHEMA = {
  type: 'object',
  required: ['team', 'ticketsDone', 'gates', 'blockers', 'notes'],
  properties: {
    team: { type: 'string' },
    ticketsDone: { type: 'array', items: { type: 'object', required: ['key', 'summary'], properties: { key: { type: 'string' }, summary: { type: 'string' } } } },
    gates: { type: 'object', required: ['allGreen', 'detail'], properties: { allGreen: { type: 'boolean' }, detail: { type: 'string' } } },
    filesTouched: { type: 'array', items: { type: 'string' } },
    blockers: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['team', 'verdict', 'findings', 'summary'],
  properties: {
    team: { type: 'string' },
    verdict: { type: 'string', enum: ['ok', 'fix'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'file', 'issue', 'fix'],
        properties: {
          severity: { type: 'string', enum: ['critical', 'minor'] },
          file: { type: 'string' }, issue: { type: 'string' }, fix: { type: 'string' },
        },
      },
    },
    summary: { type: 'string' },
  },
}

// ---------- Phase 1: Amend (Fable leads, parallel) ----------
phase('Amend')
const [beAmend, appAmend] = await parallel([
  () => agent(`${COMMON}
You are the Vita BACKEND team lead. Task: (1) bake the CEO amendments into
docs/meal-plan-handover/backend-spec.md (rewrite the affected sections — crypto §4.2 -> plaintext,
§2 backfill deleted, §5 fixtures per A4, §4.4 edit semantics per A5) and update the affected
Asana ticket notes (BE-037/038/039 at minimum) so an implementer sees ONLY the simplified truth;
(2) EXECUTE BE-036 now: write the v0.6.0 additive contract into docs/contracts/vita-api-v0.yaml
exactly per backend-spec §1 (PlanItem id/microsPerUnit/portion, GET /plan optional portions,
PUT /plan/portions, Exercise.muscleRoles, version bump 0.6.0) + the ADR (backend/Doc/ADRs/,
next free number — spec says ADR-0017; verify) + comment BE-036 with what shipped;
(3) return a build brief for the Opus builder covering BE-037..040 in dependency order with the
simplifications spelled out. Do NOT write Kotlin production code yourself — the contract YAML +
ADR + spec/ticket amendments only. Return team='backend', contractWritten=true when done.`,
    { label: 'amend:backend', phase: 'Amend', model: 'fable', agentType: 'team-lead-backend', schema: AMEND_SCHEMA }),
  () => agent(`${COMMON}
You are the Vita APP team lead. Task: bake the CEO amendments into
docs/meal-plan-handover/app-spec.md and the affected Asana tickets: A5 (edit-touches-only-that-
item semantics in §2/§5 — edited item's override resets, others survive; prune removed), A6
(numeric field stays), A7 (Edit button stays — remove any ambiguity), A8 (iOS captures-only
approved — drop it from open questions), A9 (opacity rule approved — drop from open questions),
A4 (fixtures compute from test data, no product constants), A1-A3 (delete any crypto-related
expectations that leaked into app-side text). §11 CEO questions should end up EMPTY (all
answered) — record the answers inline where relevant instead. Then return a build brief for the
Opus builder covering APP-075..081 in dependency order (075 first — it regenerates types from
the v0.6.0 contract the backend lead is writing in parallel; the contract WILL be at
docs/contracts/vita-api-v0.yaml when the builder starts), including the fragile-path warnings
from app/Next_session.md (worklets, no setState mid-gesture, onLayout tweens). Do NOT write
app production code yourself. Return team='app'.`,
    { label: 'amend:app', phase: 'Amend', model: 'fable', agentType: 'team-lead-app', schema: AMEND_SCHEMA }),
])

if (!beAmend?.contractWritten) throw new Error('Backend amend did not confirm the v0.6.0 contract — aborting before build')

// ---------- Phase 2: Build (Opus builders, parallel, disjoint folders) ----------
phase('Build')
const buildCommon = `
${COMMON}
You are an Opus BUILDER executing tickets end to end. Work directly in the checkout (no
worktree — your folder is disjoint from the other team). Follow the team spec (as amended) +
your lead's build brief EXACTLY; where they conflict with older text elsewhere, spec+brief win.
Keep a progress ledger file in your team's Progress/ folder (existing naming convention).
After finishing each ticket, add a short Asana comment (what shipped, files, tests).
Run your gates YOURSELF and iterate until green — do not return with red gates unless truly
blocked (then say why in blockers).`

const [beBuild, appBuild] = await parallel([
  () => agent(`${buildCommon}
TEAM: backend (folder ${REPO}/backend, Kotlin/Spring, board gids above).
BUILD BRIEF FROM YOUR LEAD:
${beAmend.buildBrief}
Execute BE-037, BE-038, BE-039, BE-040 in that order per docs/meal-plan-handover/backend-spec.md
(as amended: plaintext portions, no backfill, A4/A5 semantics). NOT BE-041 (image/deploy — later
round). Gates: ./gradlew check green (suite must not lose existing tests) from
backend/services/vita-api. Remember the detekt gotcha: KDoc containing "/*" patterns (e.g.
"/v1/auth/**") opens a nested comment. Anthropic key for any live-tagged test is in
backend/services/vita-api/secrets.yaml (gitignored) — but default check must stay offline/green
without it. Return team='backend'.`,
    { label: 'build:backend', phase: 'Build', model: 'opus', schema: BUILD_SCHEMA }),
  () => agent(`${buildCommon}
TEAM: app (folder ${REPO}/app/services/vita-app, Expo RN SDK 56, board gids above).
BUILD BRIEF FROM YOUR LEAD:
${appAmend.buildBrief}
Execute APP-075..081 in dependency order per docs/meal-plan-handover/app-spec.md (as amended).
APP-075 regenerates types from docs/contracts/vita-api-v0.yaml (v0.6.0, already written).
Respect the FRAGILE paths (TabsPager gestures, useSheetDrag worklets, "worklet" directives on
pure helpers used in useAnimatedStyle, mount tweens via useStartOnLayout, never setState
mid-gesture). Gates: npx tsc --noEmit exit 0 · npx jest all green · npm run api:check clean ·
npx expo export OK. Do NOT build the APK (deploy round later). Return team='app'.`,
    { label: 'build:app', phase: 'Build', model: 'opus', schema: BUILD_SCHEMA }),
])

// ---------- Phase 3: Review (Fable leads, parallel) ----------
phase('Review')
const reviewCommon = `
${COMMON}
You are the Fable team lead ADVERSARIALLY reviewing your Opus builder's uncommitted work
(read-only git diff/status allowed). Judge the diff against: your amended team spec, the CEO
amendments (above), the design handoff exact values, the contract v0.6.0, and the gates.
Actually RUN the gates yourself to confirm the builder's claim. Hunt: spec deviations, formula
errors, crypto that should have been removed, backfill that should not exist, fragile-path
violations, missing tests, philosophy slips, silent scope cuts. critical = must fix before
commit; minor = note for later. Return findings.`

const [beReview, appReview] = await parallel([
  () => agent(`${reviewCommon}
TEAM: backend. Builder reported: ${JSON.stringify(beBuild?.ticketsDone ?? [])}, gates: ${JSON.stringify(beBuild?.gates ?? {})}, blockers: ${JSON.stringify(beBuild?.blockers ?? [])}.
Gate to run: ./gradlew check in backend/services/vita-api. Return team='backend'.`,
    { label: 'review:backend', phase: 'Review', model: 'fable', agentType: 'team-lead-backend', effort: 'high', schema: REVIEW_SCHEMA }),
  () => agent(`${reviewCommon}
TEAM: app. Builder reported: ${JSON.stringify(appBuild?.ticketsDone ?? [])}, gates: ${JSON.stringify(appBuild?.gates ?? {})}, blockers: ${JSON.stringify(appBuild?.blockers ?? [])}.
Gates to run in app/services/vita-app: npx tsc --noEmit · npx jest · npm run api:check. Return team='app'.`,
    { label: 'review:app', phase: 'Review', model: 'fable', agentType: 'team-lead-app', effort: 'high', schema: REVIEW_SCHEMA }),
])

// ---------- Phase 4: Fix (conditional) ----------
phase('Fix')
const fixes = []
for (const [review, teamName, folder, gateCmd] of [
  [beReview, 'backend', 'backend/services/vita-api', './gradlew check'],
  [appReview, 'app', 'app/services/vita-app', 'npx tsc --noEmit && npx jest && npm run api:check'],
]) {
  const critical = (review?.findings ?? []).filter(f => f.severity === 'critical')
  if (!critical.length) { log(`${teamName}: review clean (no critical findings)`); continue }
  fixes.push(agent(`${buildCommon}
TEAM: ${teamName} (folder ${REPO}/${folder}). Your lead's adversarial review found CRITICAL
issues in the uncommitted build. Fix EXACTLY these, nothing else, then re-run the gates
(${gateCmd}) until green:
${critical.map((f, n) => `${n + 1}. [${f.file}] ${f.issue} — FIX: ${f.fix}`).join('\n')}
Return team='${teamName}'.`,
    { label: `fix:${teamName}`, phase: 'Fix', model: 'opus', schema: BUILD_SCHEMA }))
}
const fixed = (await parallel(fixes.map(p => () => p))).filter(Boolean)

return { beAmend, appAmend, beBuild, appBuild, beReview, appReview, fixed }