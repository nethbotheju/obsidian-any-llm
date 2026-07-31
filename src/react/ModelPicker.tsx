import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, useServices } from "./common";
import { shortModelName } from "../util";
import { parseModelRef, type ProviderConfig } from "../types";
import { CATALOG_BY_ID, providerUsable, type ModelInfo } from "../catalog";

interface ModelGroup {
  provider: ProviderConfig;
  models: ModelInfo[];
}

export function ModelPicker({
  providers,
  modelsFor,
  value,
  onChange,
}: {
  providers: ProviderConfig[];
  modelsFor: (p: ProviderConfig) => ModelInfo[];
  value: string;
  onChange: (ref: string) => void;
}) {
  const { plugin } = useServices();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasModels = providers.some((p) => providerUsable(p) && modelsFor(p).length > 0);

  let chipIcon: string | null = null;
  let chipName = "Select model";
  if (value) {
    const { providerId: configId, modelId } = parseModelRef(value);
    const cfg = providers.find((p) => p.id === configId);
    if (cfg) {
      chipIcon = plugin.providerIcon(cfg.providerId);
      const m = modelsFor(cfg).find((mm) => mm.id === modelId);
      chipName = m?.name ?? shortModelName(value);
    }
  }

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const groups = useMemo<ModelGroup[]>(() => {
    return providers
      .filter(providerUsable)
      .map((p) => {
        const all = modelsFor(p);
        const models = q
          ? all.filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
          : all;
        return { provider: p, models };
      })
      .filter((g) => g.models.length > 0);
  }, [providers, modelsFor, q]);

  const select = (ref: string) => {
    onChange(ref);
    setOpen(false);
  };

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Enter") {
      const first = groups[0]?.models[0];
      if (first && groups[0]) select(`${groups[0].provider.id}:${first.id}`);
    }
  };

  return (
    <div className="ai-chat-modelpicker" ref={containerRef}>
      <button
        className="ai-chat-model-chip"
        onClick={() => setOpen((o) => !o)}
        disabled={!hasModels}
        title={value ? `Model: ${value}` : "Select model"}
      >
        {chipIcon && <span className="ai-chat-model-logo"><Icon name={chipIcon} /></span>}
        <span className="ai-chat-model-name">{chipName}</span>
        <Icon name="chevron-down" />
      </button>

      {open && (
        <div className="ai-chat-modelpanel" role="listbox">
          <div className="ai-chat-modelpanel-search">
            <Icon name="search" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search models…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
            />
          </div>
          <div className="ai-chat-modelpanel-list">
            {groups.length === 0 && <div className="ai-chat-modelpanel-empty">No models found</div>}
            {groups.map((g) => {
              const catName = g.provider.name || CATALOG_BY_ID[g.provider.providerId]?.name || g.provider.providerId;
              const iconName = plugin.providerIcon(g.provider.providerId);
              return (
                <div key={g.provider.id} className="ai-chat-modelpanel-group">
                  <div className="ai-chat-modelpanel-header">
                    <Icon name={iconName} />
                    <span>{catName}</span>
                  </div>
                  {g.models.map((m) => {
                    const ref = `${g.provider.id}:${m.id}`;
                    const selected = ref === value;
                    return (
                      <div
                        key={ref}
                        className={`ai-chat-modelpanel-item${selected ? " is-selected" : ""}`}
                        onClick={() => select(ref)}
                      >
                        <span className="ai-chat-modelpanel-item-name">{m.name}</span>
                        {selected && <Icon name="check" className="ai-chat-modelpanel-check" />}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}