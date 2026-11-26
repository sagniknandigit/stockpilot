import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from './Skeleton'

interface TableProps extends HTMLAttributes<HTMLTableElement> {
  /** Cap the height so the header stays pinned while rows scroll (inside the card). */
  scrollY?: boolean
}

/** Wide tables scroll inside their card rather than stretching the page. */
export function Table({ className, scrollY = false, ...props }: TableProps) {
  return (
    <div
      className={cn('w-full overflow-x-auto', scrollY && 'max-h-[min(70vh,720px)] overflow-y-auto')}
    >
      <table
        className={cn('w-full border-separate border-spacing-0 text-left text-sm', className)}
        {...props}
      />
    </div>
  )
}

export function THead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className="sticky top-0 z-10" {...props} />
}

export function TBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className="[&>tr:last-child>td]:border-b-0" {...props} />
}

export function TR({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn('transition-colors [tbody_&]:hover:bg-subtle/60', className)} {...props} />
  )
}

export function TH({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        'border-y bg-subtle px-4 py-2.5 text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted uppercase first:pl-5 last:pr-5',
        className,
      )}
      {...props}
    />
  )
}

export function TD({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn('border-b px-4 py-3 align-middle first:pl-5 last:pr-5', className)}
      {...props}
    />
  )
}

export function TableSkeleton({ rows = 6, columns }: { rows?: number; columns: number }) {
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
