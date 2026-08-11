import React, { Component, ErrorInfo, ReactNode } from 'react';
import { THEME } from '@mc-admin/ui';

const c = THEME.colors;

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[React Error Boundary]', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            background: c.background || '#0f172a',
            color: c.onSurface || '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            fontFamily: THEME.fonts.heading
          }}
        >
          <div
            style={{
              maxWidth: 600,
              width: '100%',
              background: c.surfaceContainer || '#1e293b',
              border: `1px solid ${c.outline || '#334155'}`,
              borderRadius: THEME.radius.lg,
              padding: THEME.space.md,
              display: 'grid',
              gap: 16,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 32 }}>⚠️</span>
              <div>
                <h1 style={{ margin: 0, fontSize: 22, color: c.error || '#ef4444' }}>
                  Application Runtime Exception
                </h1>
                <p style={{ margin: '4px 0 0', color: c.onSurfaceVariant || '#94a3b8', fontSize: 13 }}>
                  BedrockOps encountered an unexpected rendering error. Auto-recovery active.
                </p>
              </div>
            </div>

            {this.state.error && (
              <div
                style={{
                  background: '#090d16',
                  border: `1px solid ${c.outline || '#334155'}`,
                  borderRadius: THEME.radius.md,
                  padding: 14,
                  fontFamily: THEME.fonts.mono,
                  fontSize: 12,
                  color: '#f87171',
                  maxHeight: 200,
                  overflowY: 'auto',
                  wordBreak: 'break-word'
                }}
              >
                <strong>{this.state.error.name}: {this.state.error.message}</strong>
                {this.state.error.stack && (
                  <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', color: '#94a3b8', fontSize: 11 }}>
                    {this.state.error.stack}
                  </pre>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  background: 'transparent',
                  color: c.onSurface || '#f8fafc',
                  border: `1px solid ${c.outline || '#334155'}`,
                  borderRadius: THEME.radius.md,
                  padding: '10px 16px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Reset UI State
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  background: c.primary || '#3b82f6',
                  color: c.onPrimary || '#ffffff',
                  border: 'none',
                  borderRadius: THEME.radius.md,
                  padding: '10px 20px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Reload Dashboard 🔄
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
