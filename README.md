# Javis · AI interview coach

Interview preparation webapp with a live AI voice interviewer.

## Run locally
1. `npm install`
2. `cp .env.example .env.local` and paste your Gemini key
3. `npm run dev` → http://localhost:3000

## Where things live
- `prompts/` — every Gemini prompt, one file each. Edit these to tune Javis.
- `app/theme.css` — colours, fonts and spacing.
- `app/api/llm` — the one route all AI calls go through.
