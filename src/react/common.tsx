import { Component, MarkdownRenderer, setIcon } from "obsidian";
import { createContext, useContext, useEffect, useRef } from "react";
import type { App } from "obsidian";
import type AIChatPlugin from "../main";

export interface Services {
  app: App;
  plugin: AIChatPlugin;
}

export const ServicesContext = createContext<Services | null>(null);

export function useServices(): Services {
  const ctx = useContext(ServicesContext);
  if (!ctx) throw new Error("ServicesContext not provided");
  return ctx;
}

export function Icon({ name, className }: { name: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.empty();
    setIcon(ref.current, name);
  }, [name]);
  return <span ref={ref} className={className} aria-hidden="true" />;
}

// Renders markdown via Obsidian's own renderer -> theme-perfect.
export function Markdown({ content }: { content: string }) {
  const { app } = useServices();
  const ref = useRef<HTMLDivElement>(null);
  const compRef = useRef<Component | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.empty();
    compRef.current?.unload();
    const comp = new Component();
    comp.load();
    compRef.current = comp;
    void MarkdownRenderer.render(app, content, el, "", comp);
    return () => {
      comp.unload();
      compRef.current = null;
    };
  }, [content, app]);

  return <div ref={ref} className="ai-chat-md" />;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
