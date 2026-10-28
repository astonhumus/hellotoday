import { Component, type ReactNode } from "react";

// Without this, any unexpected error leaves a blank white page. This shows a message and a way out instead.
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: unknown) { console.error("App crashed:", error); }

  // Also clears the saved app copy, in case an old cached version is what broke.
  private reset = async () => {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations();
      await Promise.all((regs ?? []).map(r => r.unregister()));
      await Promise.all((await caches.keys()).map(k => caches.delete(k)));
    } catch { /* ignore */ }
    location.reload();
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ padding: 24, maxWidth: 420, margin: "10vh auto", font: "16px/1.5 system-ui, sans-serif" }}>
        <h2>Something went wrong</h2>
        <p>The page couldn't load. Try reloading; if it keeps happening, reset the saved app copy.</p>
        <p style={{ display: "flex", gap: 8 }}>
          <button className="btn primary" onClick={() => location.reload()}>Reload</button>
          <button className="btn" onClick={this.reset}>Reset &amp; reload</button>
        </p>
      </div>
    );
  }
}
