# AGENTS.md

## Project Overview

**obsidian-ai-chat** is a [Obsidian](https://obsidian.md) plugin (desktop only) that adds a multi-provider AI chat assistant to the right sidebar. Bring-your-own-keys/endpoints, with optional ChatGPT/Claude subscription sign-in via OAuth.

- **Stack:** TypeScript, React 19, esbuild. Talks to LLMs through the [Vercel AI SDK](https://sdk.vercel.ai/) (`ai` + `@ai-sdk/*`).
- **Runtime:** bundled to a single CommonJS `main.js` loaded by Obsidian. `obsidian` and `electron` are external, never bundled.
- **Providers:** OpenAI, Anthropic (Claude), Google (Gemini), and any OpenAI-compatible endpoint (Ollama, LM Studio, OpenRouter, Groq, DeepSeek, etc.). A curated catalog lives in `src/catalog.ts`.

## Setup

```bash
bun install          # package manager is bun (bun.lock is the lockfile)
```

There are no environment variables, `.env`, or secrets to configure at build time. API keys and tokens are entered by the user at runtime via Settings → AI Chat.

## Development

```bash
bun run dev      # esbuild watch -> ./main.js (inline sourcemaps)
bun run build    # one-shot production build (minified, no sourcemaps)
```

To test in Obsidian, copy the three plugin files into your vault:

```
<vault>/.obsidian/plugins/obsidian-ai-chat/
├── main.js
├── manifest.json
└── styles.css
```

Then enable the plugin and run the **AI Chat: Open** command (or click the ribbon icon). For fast iteration, symlink the build output (`main.js`) into the vault's plugin dir so `bun run dev` live-reloads.

Type-check only (no emit — `tsconfig.json` has `noEmit`):

```bash
bunx tsc --noEmit
```

## Testing

**There is no test suite, test runner, or lint/format config in this repo.** Don't invent commands.

- When adding non-trivial logic, prefer a small runnable self-check (e.g. an `assert`-based `demo()` / `__main__` block, or a `test_*.ts` file) over scaffolding a framework.
- Always verify with `bunx tsc --noEmit` after structural changes — it's the only automated gate right now.

## Architecture

```
src/
├── main.ts          Plugin entry. Extends obsidian.Plugin. Owns settings, the
│                    provider registry, model/logo caches, OAuth token refresh.
├── ChatView.tsx     Obsidian ItemView that mounts a single React root, injecting
│                    { app, plugin } via ServicesContext.
├── react/           All UI. Consumes services via useServices() (react/common.tsx).
│   ├── ChatApp.tsx     top-level state machine
│   ├── common.tsx      ServicesContext, Icon, Markdown (Obsidian renderer) helpers
│   ├── Message*.tsx, Composer.tsx, Header.tsx, ModelPicker.tsx, HistoryPanel.tsx
│   └── ErrorBoundary.tsx
├── llm.ts           Builds the AI SDK provider registry, streamChat() streaming,
│                    and aiFetch() — a fetch wrapper that falls back to Obsidian's
│                    requestUrl (buffered, CORS-bypassing) on network failure.
├── catalog.ts       Curated provider catalog (ids, base URLs, sdk types, doc URLs).
├── sync.ts          Pulls models + logos from models.dev into vault-persisted caches.
├── auth/oauth.ts    ChatGPT + Claude OAuth (PKCE) flows and token refresh.
├── store.ts         Conversation JSON persistence in the vault; DEFAULT_SETTINGS.
├── settings-tab.ts  Obsidian PluginSettingTab (provider/model config UI).
├── types.ts         Core types: Conversation, ProviderConfig, PluginSettings, StoredToken.
└── util.ts          Misc helpers.
```

**Key flows:**

- **Model references** are `"providerId:modelId"` strings (see `modelRef`/`parseModelRef` in `types.ts`). The provider `id` is a per-instance UUID-like key from `ProviderConfig.id`, the catalog `providerId` identifies the vendor.
- **Streaming:** `streamChat()` (`llm.ts`) drives `ai`'s `streamText`. Streaming works live when the provider allows browser CORS; otherwise `aiFetch` transparently falls back to Obsidian's `requestUrl` (buffered, no live streaming). Don't bypass `aiFetch` for SDK calls.
- **Persistence:** each conversation is one JSON file under `<vault>/.obsidian/plugins/obsidian-ai-chat/conversations/<id>.json`, in AI SDK message format (so it doubles as export/import). Always go through `src/store.ts` for reads/writes.
- **Token refresh:** `Plugin.ensureFreshTokens()` is called before sending; refreshes expired OAuth access tokens and rebuilds the registry. New provider calls should assume the registry is current only after this runs.

## Code Style & Conventions

- **TypeScript strict mode**, `target: ES2020`, `jsx: react-jsx` (automatic runtime — no `import React`).
- React 19 with hooks. No class components in `src/react/`. Get Obsidian APIs through `useServices()` from `react/common.tsx`, never via globals.
- Use Obsidian's own APIs over reinvention: `MarkdownRenderer` for markdown, `setIcon`/`addIcon` for icons, `requestUrl` for network when `fetch` fails, `vault.adapter` for file IO. Render markdown via the `<Markdown>` component in `common.tsx`.
- Minimal comments. Reserve `ponytail:` comments for deliberate simplifications that cut a corner with a known ceiling (note the ceiling + upgrade path).
- No unrequested abstractions. Reuse existing helpers in `util.ts` / `common.tsx` before writing new ones.
- When making changes or enhancements, remove any code left unused by the change — dead CSS classes, orphaned helpers, unused imports, stale comments. Clean it up in the same change; don't leave it for later.

## Build & Deployment

- `bun run build` emits the minified `main.js`. Distribute the trio `main.js` + `manifest.json` + `styles.css` (no `node_modules`, no `main.js.map` — it's gitignored).
- Bump `manifest.json` `version` (and `package.json`) together on releases. `minAppVersion` is `1.4.0`; `isDesktopOnly: true`.
- No CI/CD pipeline yet — builds are manual.

## Pull Request Guidelines

- No enforced lint/test gate exists. Before asking for review:
  - `bun run build` succeeds with no esbuild errors.
  - `bunx tsc --noEmit` is clean.
- Commit messages follow the existing Conventional Commits style (e.g. `feat:`, `fix:`, `chore:`). Keep the subject line under ~72 chars.
- Don't commit `main.js` or `main.js.map` — both are gitignored and are build artifacts.
