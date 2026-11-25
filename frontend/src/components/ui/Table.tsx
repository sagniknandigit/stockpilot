import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from './Skeleton'

/** Wide tables scroll horizontally inside their card rather than stretching the page. */
export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-left text-sm', className)} {...props} />
    </div>
  )
}

export function THead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className="border-b bg-subtle/60" {...props} />
}

export function TBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className="divide-y" {...props} />
}

export function TR({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('transition-colors', className)} {...props} />
}

export function TH({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        'px-4 py-2.5 text-xs font-medium whitespace-nowrap text-muted first:pl-5 last:pr-5',
        className,
      )}
      {...props}
    />
  )
}

export function TD({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-4 py-3 align-middle first:pl-5 last:pr-5', className)} {...props} />
}

export function TableSkeleton({ rows = 5, columns }: { rows?: number; columns: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <TR key={row}>
          {Array.from({ length: columns }, (_, col) => (
            <TD key={col}>
              <Skeleton className={cn('h-4', col === 0 ? 'w-40' : 'w-16')} />
            </TD>
          ))}
        </TR>
      ))}
    </>
  )
}
