import { Component, type ErrorInfo, type ReactNode } from 'react';
import { captureException } from '@/sentry';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
    // captureException is a no-op when VITE_SENTRY_DSN isn't configured,
    // so this is safe to call unconditionally.
    captureException(error, {
      tags: { source: 'error-boundary' },
      extra: { componentStack: info.componentStack },
    });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="font-serif text-3xl">Something went wrong</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            We hit an unexpected error loading this page. Refreshing usually fixes it.
            If the problem keeps happening, please call the salon.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="rounded-full bg-rose-500 px-5 py-2 text-sm font-semibold text-white hover:bg-rose-600"
            >
              Reload page
            </button>
            <button
              onClick={this.reset}
              className="rounded-full border border-border px-5 py-2 text-sm font-semibold hover:bg-muted"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
