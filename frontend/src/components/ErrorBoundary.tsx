import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches any render-time error in the tree below it and shows a recovery screen
 * instead of a blank white page. Also logs to the console so you can still debug.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught error in app tree:", error, info);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-lg w-full text-center">
          <p className="text-sm font-mono text-muted-foreground tracking-widest">
            Something went wrong
          </p>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">
            The page hit an unexpected error
          </h1>
          <p className="mt-3 text-muted-foreground">
            Nothing was lost — reload to try again. If it keeps happening, copy the
            details below and send them to support.
          </p>
          <pre className="mt-6 text-left text-xs bg-muted text-muted-foreground rounded-md p-4 overflow-auto max-h-48">
            {this.state.error.message}
          </pre>
          <button
            onClick={this.handleReload}
            className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
          >
            Reload the page
          </button>
        </div>
      </div>
    );
  }
}