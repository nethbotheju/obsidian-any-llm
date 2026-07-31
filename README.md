# AI Chat (obsidian-ai-chat)

A multi-provider AI chat assistant for Obsidian. Lives in the right sidebar. Bring your own keys and endpoints, or sign in with your ChatGPT / Claude subscription.

## Providers

Configured in **Settings → AI Chat**. A curated catalog ships with every common provider preconfigured — pick one, add your key (or sign in), and the model list and logo sync from [models.dev](https://models.dev).

- **API key** — OpenAI, Anthropic (Claude), Google (Gemini), DeepSeek, Groq, Mistral, xAI (Grok), OpenRouter, Together AI, Fireworks AI, Cerebras, Perplexity, and OpenCode Go.
- **Subscription sign-in (OAuth)** — use your **ChatGPT Plus/Pro** or **Claude Pro/Max** account directly. No API key needed.
- **Local / custom** — Ollama (`http://localhost:11434/v1`), LM Studio, or any endpoint that speaks the OpenAI Chat Completions API. Enter a Base URL and list your model ids manually.

## Conversations

Each conversation is persisted as JSON at:

```
<vault>/.obsidian/plugins/obsidian-ai-chat/conversations/<id>.json
```

It's plain JSON — copy or share the file as an export, or drop one back into the folder to re-import it.

## Develop

```bash
bun install
bun run dev      # esbuild watch -> ./main.js
```

Copy `main.js`, `manifest.json`, `styles.css` into your vault at
`<vault>/.obsidian/plugins/obsidian-ai-chat/`, then enable the plugin and run the
**AI Chat: Open AI Chat** command (or click the ribbon icon).

## Notes

- Desktop only for now (mobile later).
- Requests stream when the provider allows browser CORS; otherwise they fall back
  to Obsidian's `requestUrl` (works everywhere, buffered, no live streaming).
