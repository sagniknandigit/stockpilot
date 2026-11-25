import { Compass } from 'lucide-react'
import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-5 grid size-12 place-items-center rounded-xl border bg-subtle text-muted">
        <Compass className="size-6" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-accent">404</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Page not found</h1>
      <p className="mt-2 max-w-sm text-muted">
        The page you’re looking for doesn’t exist or may have been moved.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex h-9 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground shadow-sm hover:bg-accent-hover"
      >
        Back to dashboard
      </Link>
    </div>
  )
}
