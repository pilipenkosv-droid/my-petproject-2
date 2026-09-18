# LLM quota fallback (local runs)

Rule from the owner (2026-09-18):

- Local benches, scripts and tests call Gemini through the owner's **free-tier API key** in `.env.local`. When that quota is exhausted (HTTP 429 `generate_content_free_tier_requests`, `AllModelsUnavailableError`), **do not** switch to the Anthropic API and do not add any paid provider.
- Instead, do the LLM work with a **Haiku subagent inside Claude Code / Claude Desktop** (`Agent` tool, `model: haiku`), which runs within the owner's subscription. Feed it the same batch files / prompts the script would send to the model (see `scripts/tg-pains/*` in the Second Brain repo for the batch-file pattern) and merge the JSONL it returns.
- This applies to development only. Production code keeps using the Vercel AI Gateway / Gemini path; the Anthropic API is never called from application code (see `CLAUDE.md`).
- The `CLAUDE_CLI_ENABLED` / `claude -p` bench path in `src/lib/ai/gateway*.ts` is **not** the fallback: it spawns a nested CLI that the environment policy blocks. Use the Agent tool from the session.
