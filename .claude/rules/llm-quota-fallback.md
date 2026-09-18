# LLM quota fallback (local runs)

Rule from the owner (2026-09-18):

- Local benches, scripts and tests call Gemini through the owner's **free-tier API key** in `.env.local`. When that quota is exhausted (HTTP 429 `generate_content_free_tier_requests`, `AllModelsUnavailableError`), **do not** switch to the Anthropic API and do not add any paid provider.
- Instead, do the LLM work with a **Haiku subagent inside Claude Code / Claude Desktop** (`Agent` tool, `model: haiku`), which runs within the owner's subscription. Feed it the same batch files / prompts the script would send to the model (see `scripts/tg-pains/*` in the Second Brain repo for the batch-file pattern) and merge the JSONL it returns.
- This applies to development only. Production code keeps using the Vercel AI Gateway / Gemini path; the Anthropic API is never called from application code (see `CLAUDE.md`).
- The `CLAUDE_CLI_ENABLED` / `claude -p` bench path in `src/lib/ai/gateway*.ts` is **not** the fallback: it spawns a nested CLI that the environment policy blocks. Use the Agent tool from the session.

## Cost approval for experiments (owner rule, 2026-09-18)

- Any experiment or bench that spends money — paid LLM calls through the AI Gateway or any API key, paid infrastructure, extra Vercel/Supabase usage — is **estimated first and approved by the owner before launch**. The estimate names: number of calls, tokens per call, model prices, expected total, and the hard cap the script enforces.
- Free-tier keys are not an exception when a run can exhaust them: say what the quota is and what breaks when it runs out.
- Never let a subagent decide a budget on its own ("keep it under ~$2" in a brief is not approval).
