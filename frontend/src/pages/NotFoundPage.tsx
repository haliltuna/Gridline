import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <p className="text-sm font-mono text-muted-foreground tracking-widest">404</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          That page doesn't exist
        </h1>
        <p className="mt-3 text-muted-foreground">
          The link may be broken, or the page may have been moved. If a client sent you
          here, ask them to re-share the link.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            Go home
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}