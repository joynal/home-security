import { Component, type ErrorInfo, type ReactNode } from 'react';
import { css } from '@emotion/react';
import { AlertOctagon, RotateCcw } from 'lucide-react';
import { tokens } from '@/theme/designTokens';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

const errorCardStyles = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  background: ${tokens.colors.bg.card};
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: ${tokens.radii.lg};
  margin: 24px;
  box-shadow: ${tokens.shadows.card};

  .eb-icon {
    color: ${tokens.colors.status.danger};
    margin-bottom: 16px;
    background: rgba(239, 68, 68, 0.1);
    padding: 12px;
    border-radius: ${tokens.radii.full};
    display: inline-flex;
  }

  .eb-title {
    font-size: 18px;
    font-weight: 700;
    color: ${tokens.colors.text.primary};
    margin: 0 0 8px;
  }

  .eb-desc {
    font-size: 13px;
    color: ${tokens.colors.text.muted};
    max-width: 440px;
    margin: 0 0 20px;
    line-height: 1.5;
  }

  .eb-details {
    font-family: monospace;
    font-size: 12px;
    color: #f87171;
    background: rgba(0, 0, 0, 0.4);
    padding: 10px 14px;
    border-radius: ${tokens.radii.sm};
    max-width: 520px;
    overflow-x: auto;
    margin-bottom: 24px;
    text-align: left;
    width: 100%;
    box-sizing: border-box;
  }

  .eb-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    background: ${tokens.colors.accent.primary};
    color: white;
    font-size: 13px;
    font-weight: 600;
    border: none;
    border-radius: ${tokens.radii.md};
    cursor: pointer;
    transition: background 0.15s;

    &:hover {
      background: ${tokens.colors.accent.hover};
    }
  }
`;

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div css={errorCardStyles} role="alert">
          <div className="eb-icon">
            <AlertOctagon size={32} strokeWidth={2} />
          </div>
          <h2 className="eb-title">Something went wrong</h2>
          <p className="eb-desc">
            An unexpected error occurred while rendering this view. You can reload the view or check
            the developer console.
          </p>
          {this.state.error && (
            <div className="eb-details">{this.state.error.message || 'Unknown render error'}</div>
          )}
          <button className="eb-btn" onClick={this.handleReset}>
            <RotateCcw size={14} />
            Reload view
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
