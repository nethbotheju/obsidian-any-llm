# AGENTS.md

## Project Overview

**AnyLLM** is an [Obsidian](https://obsidian.md) plugin (desktop only) that adds a multi-provider AI chat assistant to the right sidebar. Bring-your-own-keys/endpoints, with optional ChatGPT/Claude subscription sign-in via OAuth.

- **Stack:** TypeScript, React 19, esbuild. Talks to LLMs through the [Vercel AI SDK](https://sdk.vercel.ai/) (`ai` + `@ai-sdk/*`).
- **Runtime:** bundled to a single CommonJS `main.js` loaded by Obsidian. `obsidian` and `electron` are external, never bundled.
- **Providers:** OpenAI, Anthropic (Claude), Google (Gemini), and any OpenAI-compatible endpoint (Ollama, LM Studio, OpenRouter, Groq, DeepSeek, etc.). A curated catalog lives in `src/catalog.ts`.

## Setup

```bash
bun install          # package manager is bun (bun.lock is the lockfile)
```

There are no environment variables, `.env`, or secrets to configure at build time. API keys and tokens are entered by the user at runtime via Settings → AnyLLM.

## Development

```bash
bun run dev      # esbuild watch -> ./main.js (inline sourcemaps)
bun run build    # one-shot production build (minified, no sourcemaps)
```

Test in the demo vault **Biology Vault** (repo root, gitignored): its plugin files are symlinks to the
build outputs, so `bun run build` (or `bun run dev`) updates it directly. The vault runs the **hot-reload**
plugin (any-llm dir has a `.hotreload` marker), which auto-reloads `main.js`/`styles.css` changes — no
copying, no restart needed. Only `manifest.json` changes need a manual restart:

```bash
osascript -e 'quit app "Obsidian"' 2>/dev/null
while pgrep -x Obsidian >/dev/null; do sleep 0.2; done
open "obsidian://open?path=$PWD/Biology%20Vault"
```

Type-check only (no emit — `tsconfig.json` has `noEmit`):

```bash
bunx tsc --noEmit
```

## Testing

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
- **Persistence:** each conversation is one JSON file under `<vault>/.obsidian/plugins/any-llm/conversations/<id>.json`, in AI SDK message format (so it doubles as export/import). Always go through `src/store.ts` for reads/writes.
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
- `minAppVersion` is `1.4.0`; `isDesktopOnly: true`.

## Releasing

A release is a version-bump PR followed by a tag push. The bump needs a PR (the `main` ruleset requires one); the tag does not — no tag ruleset exists, so tags push straight to the repo.

1. Bump `version` in `manifest.json` **and** `package.json` together — they must stay in sync. Use a patch bump (`0.1.0` → `0.1.1`) when everything since the last tag is `fix:`/`docs:`/`chore:`/`refactor:`; reserve minor bumps for `feat:`.
2. Branch `chore/release-<version>` and open a PR. No issue is needed for a release. The ruleset requires zero approvals, so self-merging is fine.
3. Merge, then `git pull` on `main` and tag **the merge commit** — not the branch commit:
   ```bash
   git tag <version>        # no "v" prefix; must equal manifest.json version
   git push origin <version>
   ```
4. The tag push triggers `.github/workflows/release.yml`: `bun install --frozen-lockfile` + `bun run build`, then `main.js`, `manifest.json`, and `styles.css` are attached with generated release notes.
5. Verify with `gh release view <version>` — all three assets must be present.

Never create a release from the GitHub UI: it attaches no assets (Obsidian and BRAT install only from those three files) and tags whatever `main` currently points at. The workflow neither validates nor syncs versions — a tag disagreeing with `manifest.json` ships a mislabeled release that users never see as an update.

## Pull Request Guidelines

- No enforced lint/test gate exists. Before asking for review:
  - `bun run build` succeeds with no esbuild errors.
  - `bunx tsc --noEmit` is clean.
- Commit messages follow the existing Conventional Commits style (e.g. `feat:`, `fix:`, `chore:`). Keep the subject line under ~72 chars.
- Don't commit `main.js` or `main.js.map` — both are gitignored and are build artifacts.
