import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level error boundary.
 *
 * Without this, any uncaught render error in production results in a totally
 * blank page (React unmounts the tree and minified stacks are useless without
 * the dev overlay). This component catches such errors, logs them to the
 * browser console, and renders a minimal recovery UI so the user can at least
 * see what went wrong and reload.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[GADV] Uncaught render error:", error, info?.componentStack);
  }

  handleReload = (): void => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          background: "#0f172a",
          color: "#e2e8f0",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ maxWidth: 720, width: "100%" }}>
          <div style={{ fontSize: 12, letterSpacing: 2, color: "#94a3b8", marginBottom: 8 }}>
            GADV INSTRUMENT CONSOLE
          </div>
          <h1 style={{ fontSize: 22, margin: "0 0 12px", color: "#fca5a5" }}>
            The dashboard hit an unrecoverable error
          </h1>
          <p style={{ color: "#cbd5e1", marginBottom: 16, lineHeight: 1.5 }}>
            Something went wrong while rendering. The error is logged to your
            browser console. You can reload to recover.
          </p>
          <pre
            style={{
              background: "#1e293b",
              color: "#fecaca",
              padding: 12,
              borderRadius: 6,
              fontSize: 12,
              overflow: "auto",
              maxHeight: 240,
              border: "1px solid #334155",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {error.message}
            {error.stack ? `\n\n${error.stack}` : ""}
          </pre>
          <button
            onClick={this.handleReload}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              background: "#2563eb",
              color: "white",
              border: "none",
              borderRadius: 6,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
