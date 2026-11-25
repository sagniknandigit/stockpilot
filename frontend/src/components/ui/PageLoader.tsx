import { Skeleton } from './Skeleton'

/** Placeholder while a lazily-loaded page chunk downloads. */
export function PageLoader() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading page">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  )
}
