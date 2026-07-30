import { Menu } from "obsidian";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Icon } from "./common";
import { shortModelName } from "../util";
import type { ProviderConfig } from "../types";

export function ModelPicker({
  providers,
  value,
  onChange,
}: {
  providers: ProviderConfig[];
  value: string;
  onChange: (ref: string) => void;
}) {
  const hasModels = providers.some((p) => p.models.length > 0);

  const open = (e: ReactMouseEvent<HTMLButtonElement>) => {
    const menu = new Menu();
    let any = false;
    for (const p of providers) {
      if (p.models.length === 0) continue;
      any = true;
      menu.addItem((item) => {
        item.setTitle(p.name || p.id).setDisabled(true);
      });
      for (const m of p.models) {
        const ref = `${p.id}:${m}`;
        menu.addItem((item) =>
          item
            .setTitle(m)
            .setChecked(ref === value)
            .onClick(() => onChange(ref)),
        );
      }
    }
    if (!any) {
      menu.addItem((item) => item.setTitle("No models configured").setDisabled(true));
    }
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
