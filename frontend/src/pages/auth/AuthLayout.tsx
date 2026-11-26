import { BarChart3, ScanBarcode, ShieldCheck } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Logo } from '@/components/layout/Logo'
import { fadeUp, stagger } from '@/lib/motion'
import { DemoLoginButton } from './DemoLoginButton'
import { ProductMock } from './ProductMock'

const FEATURES = [
  {
    icon: ScanBarcode,
    title: 'Checkout in seconds',
    text: 'Scan, tap and charge — built for a busy counter.',
  },
  {
    icon: ShieldCheck,
    title: 'Stock you can trust',
    text: 'Every unit is tracked in an auditable ledger.',
  },
  {
    icon: BarChart3,
    title: 'Know what to reorder',
    text: 'Live revenue, low-stock alerts and forecasts.',
  },
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
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[oklch(0.17_0.03_275)] p-10 text-white lg:flex lg:flex-col xl:p-14">
        {/* Brand glow + subtle grid */}
        <div
          className="absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(55% 45% at 15% 0%, color-mix(in oklch, var(--accent) 70%, transparent), transparent), radial-gradient(45% 40% at 100% 100%, color-mix(in oklch, var(--accent-2) 55%, transparent), transparent)',
          }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 [background-image:linear-gradient(rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.04)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)] [background-size:40px_40px]"
          aria-hidden="true"
        />

        <Logo className="relative [&_span:last-child]:text-white" />

        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="relative mt-14 max-w-lg"
        >
          <motion.p
            variants={fadeUp}
            className="text-[13px] font-semibold tracking-wide text-white/60 uppercase"
          >
            Inventory + POS for independent retail
          </motion.p>
          <motion.h2
            variants={fadeUp}
            className="mt-3 text-4xl leading-[1.1] font-semibold tracking-tight xl:text-5xl"
          >
            Run your whole store from{' '}
            <span className="bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
              one screen.
            </span>
          </motion.h2>
          <motion.ul variants={stagger} className="mt-8 space-y-4">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <motion.li key={title} variants={fadeUp} className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15 ring-inset">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-[15px] font-medium">{title}</span>
                  <span className="block text-sm text-white/65">{text}</span>
                </span>
              </motion.li>
            ))}
          </motion.ul>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="relative mt-auto max-w-lg pt-12 pr-8 pb-10"
        >
          <ProductMock />
        </motion.div>
      </aside>

      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-sm"
        >
          <Logo className="mb-10 lg:hidden" />
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="mt-2 text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <div className="my-6 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-border" />
            or explore first
            <span className="h-px flex-1 bg-border" />
          </div>
          <DemoLoginButton />
          <p className="mt-6 text-center text-[13px] text-muted">{footer}</p>
        </motion.div>
      </main>
    </div>
  )
}
