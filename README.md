# AnyLLM

A multi-provider AI chat assistant for Obsidian. Lives in the right sidebar. Bring your own keys and endpoints, or sign in with your ChatGPT / Claude subscription.

## Providers

Configured in **Settings → AnyLLM**. A curated catalog ships with every common provider preconfigured — pick one, add your key (or sign in), and the model list and logo sync from [models.dev](https://models.dev).

- **API key** — OpenAI, Anthropic (Claude), Google (Gemini), DeepSeek, Groq, Mistral, xAI (Grok), OpenRouter, Together AI, Fireworks AI, Cerebras, Perplexity, and OpenCode Go.
- **Subscription sign-in (OAuth)** — use your **ChatGPT Plus/Pro** or **Claude Pro/Max** account directly. No API key needed.
- **Local / custom** — Ollama (`http://localhost:11434/v1`), LM Studio, or any endpoint that speaks the OpenAI Chat Completions API. Enter a Base URL and list your model ids manually.

## Attachments

Models advertise supported input types through models.dev. The composer enables only the attachment types supported by the selected model. Images, PDFs, audio, video, and text files are stored as base64 data in the conversation JSON so conversations remain portable. Attachments are limited to 20 MB per file and 50 MB per message.

## Conversations

Each conversation is persisted as JSON at:

```
<vault>/.obsidian/plugins/any-llm/conversations/<id>.json
```

It's plain JSON — copy or share the file as an export, or drop one back into the folder to re-import it.

## Install (beta)

AnyLLM is in beta and distributed via [BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Install and enable the **BRAT** community plugin.
2. BRAT settings → **Add Beta plugin** → enter `nethbotheju/obsidian-ai-plugin`.
3. BRAT installs AnyLLM from the latest GitHub release. Enable it, then run the
   **AnyLLM: Open** command (or click the ribbon icon).

## Develop

```bash
bun install
bun run dev      # esbuild watch -> ./main.js
```

Copy `main.js`, `manifest.json`, `styles.css` into your vault at
`<vault>/.obsidian/plugins/any-llm/`, then enable the plugin and run the
**AnyLLM: Open** command (or click the ribbon icon).

## Notes

- Desktop only for now (mobile later).
- Requests stream when the provider allows browser CORS; otherwise they fall back
  to Obsidian's `requestUrl` (works everywhere, buffered, no live streaming).
