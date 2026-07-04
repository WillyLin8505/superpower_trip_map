# Project instructions

## Two-model workflow: Claude drives, Codex reviews

This project deliberately splits work across **Claude Code** (driver/implementer) and
**OpenAI Codex** (independent reviewer). Claude and Codex bill against **separate quotas**,
so routing review to Codex both balances usage and provides genuine cross-model checking.

The `codex` skill (gstack) exposes three modes:
- **review** — independent diff review with a pass/fail gate
- **challenge** — adversarial: actively tries to break the code
- **consult** — second opinion / Q&A with session continuity

### Default roles
- **Claude** plans, implements, and integrates.
- **Codex** independently reviews every non-trivial diff before it is considered done.

### Mandatory cross-review loop
For any substantive source change (skip docs-only, trivial one-liners, and test-only tweaks):

1. Implement in small commits.
2. Run the `codex` skill in **review** mode against the working diff (`git diff`).
   For security-sensitive or tricky logic, also run **challenge**.
3. Treat findings as **claims to verify, not orders**: check each against the actual code
   before acting (see the `receiving-code-review` skill). Don't blindly comply; don't blindly
   dismiss. A Claude/Codex disagreement is a signal to dig deeper, not to average.
4. Address confirmed findings; re-review if the changes were significant; then merge.
5. **Never merge Claude-authored non-trivial code that Codex has not reviewed.**

### Plans
At the planning stage, get an independent Codex critique with `gsd-review --codex`
(or `gsd-plan-review-convergence` to iterate until concerns resolve) before executing.

### Test authoring → Codex (default)
When a change needs new or substantial test code, **delegate the authoring to the Codex CLI**
instead of writing it inline, then review + run the result (this is the reverse direction —
it offloads onto the separate OpenAI quota):

```bash
codex exec -s workspace-write -m gpt-5.5 -C "<repo-or-worktree-dir>" \
  "<precise prompt: what to test, which file(s) to create, do NOT touch source, do NOT run tests>"
```

- **`-m gpt-5.5` is mandatory.** This machine's Codex uses ChatGPT-account auth, which rejects
  the config default `gpt-5-codex` (and `gpt-5`). Working slugs: `gpt-5.5` / `gpt-5.4` / `gpt-5.4-mini`.
- Point `-C` at the worktree that actually contains the target files (e.g. main-only files → main worktree).
- **After Codex writes:** read the test (real assertions? proper env/isolation? no tautologies or
  over-mocking?), then **run it**. Never commit a Codex-authored test you haven't run yourself.
- Scope: new suites / substantial test authoring → Codex; trivial one-line assertion tweaks → inline is fine.
- Output noise to ignore: `rmcp ...` Supabase-MCP auth error + `hook:` lines (non-fatal); filter with
  `grep -vE "rmcp::|hook: |Model metadata"`.

### Heavier usage balancing (optional, reverse direction)
To offload Claude further, delegate a well-scoped, mechanical implementation task to the
**Codex CLI to author** (same `codex exec -m gpt-5.5` syntax), then have Claude run `/code-review`
on it. The default remains Claude-drives / Codex-reviews.

### Single source of truth
Both models review the same `git diff`. Don't paraphrase the change — point the reviewer at
the diff so context never drifts between the two models.
