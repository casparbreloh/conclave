# Conclave

Conclave is a terminal AI council: multiple models answer in parallel, then a chairman model synthesizes one final response.
It is built for fast, grounded answers with optional web and deep research tools.

## Quickstart

1. Install dependencies: `bun install`
2. Create env file: `cp .env.example .env.local`
3. Set keys in `.env.local`:
   - `OPENROUTER_API_KEY`
   - `EXA_API_KEY`
4. Run: `bun run dev`

## Configuration

Runtime config lives at the repo root in `config.json`.

- `models`: participating model IDs
- `chairmanModel`: model used for synthesis
- `sequentialThinking`: enable/disable the native sequential thinking tool
- `webSearch`: enable/disable `webSearch` + `crawlPages`
- `deepResearch`: enable/disable Exa Deep tool
