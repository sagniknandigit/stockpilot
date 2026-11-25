import { BarChart3, ScanBarcode, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { Logo } from '@/components/layout/Logo'

const FEATURES = [
  { icon: ScanBarcode, text: 'Fast checkout with barcode scanning' },
  { icon: ShieldCheck, text: 'Ledger-backed stock you can reconcile' },
  { icon: BarChart3, text: 'Live revenue and low-stock insights' },
]

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-zinc-950 p-10 text-white lg:flex lg:flex-col">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(60% 50% at 20% 10%, rgb(99 102 241 / 0.55), transparent), radial-gradient(50% 40% at 90% 90%, rgb(14 165 233 / 0.35), transparent)',
          }}
          aria-hidden="true"
        />
        <div className="relative flex items-center gap-2.5">
          <Logo className="[&_span]:text-white" />
        </div>
        <div className="relative mt-auto max-w-md">
          <h2 className="text-3xl font-semibold tracking-tight">
            Inventory and point of sale, in one place.
          </h2>
          <p className="mt-3 text-zinc-400">
            Built for small retailers who want accurate stock without the spreadsheet.
          </p>
          <ul className="mt-8 space-y-3">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-zinc-300">
                <span className="grid size-8 place-items-center rounded-lg bg-white/10">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <Logo className="mb-8 lg:hidden" />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="mt-1.5 text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-6 text-center text-[13px] text-muted">{footer}</p>
        </div>
      </main>
    </div>
  )
}
