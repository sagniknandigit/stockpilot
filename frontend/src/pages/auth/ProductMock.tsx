/**
 * A stylised, purely decorative product screenshot built from divs — crisp at any size,
 * no image assets, and it follows the brand tokens.
 */
export function ProductMock() {
  const bars = [38, 52, 46, 64, 58, 72, 88]
  return (
    <div className="relative" aria-hidden="true">
      <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-2xl backdrop-blur-md">
        <div className="mb-4 flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-white/20" />
          <span className="size-2.5 rounded-full bg-white/20" />
          <span className="size-2.5 rounded-full bg-white/20" />
          <span className="ml-3 h-2 w-28 rounded-full bg-white/10" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1 rounded-xl bg-brand-gradient p-3">
            <p className="text-[10px] text-white/70">Today’s revenue</p>
            <p className="mt-1 text-lg font-semibold text-white">₹11,553</p>
            <p className="mt-1 inline-block rounded-full bg-white/15 px-1.5 text-[10px] text-white">
              +8.2%
            </p>
          </div>
          {[
            ['Orders', '83'],
            ['Low stock', '7'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <p className="text-[10px] text-white/60">{label}</p>
              <p className="mt-1 text-lg font-semibold text-white">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex h-28 items-end gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          {bars.map((height, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-md bg-gradient-to-t from-white/10 to-white/50"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      </div>

      {/* Floating receipt card */}
      <div className="absolute -right-6 -bottom-10 w-44 rotate-3 rounded-xl border border-white/10 bg-black/60 p-3 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="grid size-5 place-items-center rounded-full bg-success text-[10px] text-white">
            ✓
          </span>
          <p className="text-[11px] font-medium text-white">Sale complete</p>
        </div>
        <div className="mt-2 space-y-1.5">
          <div className="flex justify-between text-[10px] text-white/60">
            <span>Masala Chai 250g</span>
            <span>₹180</span>
          </div>
          <div className="flex justify-between text-[10px] text-white/60">
            <span>Oat Cookies ×2</span>
            <span>₹140</span>
          </div>
          <div className="flex justify-between border-t border-dashed border-white/15 pt-1.5 text-[11px] font-semibold text-white">
            <span>Total</span>
            <span>₹320</span>
          </div>
        </div>
      </div>
    </div>
  )
}
