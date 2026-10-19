import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary capturou erro:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "28px 20px",
            textAlign: "center",
            background: "#ffffff",
            borderRadius: "22px",
            margin: "16px 0",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              background: "rgba(239, 68, 68, 0.1)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ef4444",
              marginBottom: "12px",
            }}
          >
            <AlertTriangle size={24} />
          </div>
          <h3 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 700, color: "#1e293b" }}>
            {this.props.fallbackTitle || "Ocorreu uma instabilidade nesta seção"}
          </h3>
          <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#64748b" }}>
            Os dados continuam salvos no servidor. Clique abaixo para recarregar a visualização.
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, error: undefined });
              this.props.onReset?.();
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 20px",
              background: "#6355ff",
              color: "#ffffff",
              border: "none",
              borderRadius: "12px",
              fontWeight: 700,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            <RefreshCw size={14} />
            <span>Recarregar Visualização</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
