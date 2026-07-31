import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: (reset: () => void) => ReactNode;
}

export class ErrorBoundary extends Component<Props, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ai-chat: message render failed", error, info);
  }

  private reset = () => this.setState({ hasError: false });

  render(): ReactNode {
    if (this.state.hasError) return this.props.fallback?.(this.reset) ?? null;
    return this.props.children;
  }
}
