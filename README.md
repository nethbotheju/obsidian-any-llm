# AI Chat (obsidian-ai-chat)

A multi-provider AI chat assistant for Obsidian. Lives in the right sidebar. Bring your own keys and endpoints.

## Providers

Configured in Settings → AI Chat. Four provider types:

- **OpenAI** — `@ai-sdk/openai`
- **Anthropic (Claude)** — `@ai-sdk/anthropic`
- **Google (Gemini)** — `@ai-sdk/google`
- **OpenAI-compatible** — any endpoint that speaks the OpenAI Chat Completions API: Ollama (`http://localhost:11434/v1`), LM Studio, OpenRouter, Groq, Together, self-hosted, etc.

## Conversations

Each conversation is persisted as JSON at:

```
<vault>/.obsidian/plugins/obsidian-ai-chat/conversations/<id>.json
```

The file is the AI SDK message format, so it doubles as an export — copy/share it directly. Re-importing is reading it back.

## Develop

```bash
bun install
bun run dev      # esbuild watch -> ./main.js
```

Copy `main.js`, `manifest.json`, `styles.css` into your vault at
`<vault>/.obsidian/plugins/obsidian-ai-chat/`, then enable the plugin and run the
**AI Chat: Open** command (or click the ribbon icon).

## Notes

- Desktop only for now (mobile later).
- Requests stream when the provider allows browser CORS; otherwise they fall back
  to Obsidian's `requestUrl` (works everywhere, buffered, no live streaming).
