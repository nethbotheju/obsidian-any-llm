import { Menu } from "obsidian";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Icon } from "./common";
import { shortModelName } from "../util";
import type { ProviderConfig } from "../types";
import { CATALOG_BY_ID, providerUsable, type ModelInfo } from "../catalog";

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
  const hasModels = providers.some((p) => providerUsable(p) && modelsFor(p).length > 0);

  const open = (e: ReactMouseEvent<HTMLButtonElement>) => {
    const menu = new Menu();
    let any = false;
    for (const p of providers) {
      if (!providerUsable(p)) continue;
      const models = modelsFor(p);
      if (models.length === 0) continue;
      any = true;
      const catName = p.name || CATALOG_BY_ID[p.providerId]?.name || p.providerId;
      menu.addItem((item) => item.setTitle(catName).setDisabled(true));
      for (const m of models) {
        const ref = `${p.id}:${m.id}`;
        menu.addItem((item) =>
          item
            .setTitle(m.name)
            .setChecked(ref === value)
            .onClick(() => onChange(ref)),
        );
      }
    }
    if (!any) menu.addItem((item) => item.setTitle("No models — sync a provider in Settings").setDisabled(true));
    menu.showAtMouseEvent(e.nativeEvent);
  };

  return (
    <button
      className="ai-chat-model-chip"
      onClick={open}
      disabled={!hasModels}
      title={value ? `Model: ${value}` : "Select model"}
    >
      <span className="ai-chat-model-name">{value ? shortModelName(value) : "Select model"}</span>
      <Icon name="chevron-down" />
    </button>
  );
}