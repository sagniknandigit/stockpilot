import { ChevronDown, MapPin } from 'lucide-react'
import { controlStyles } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { useCurrentLocation } from '@/providers/LocationContext'

export function LocationSwitcher() {
  const { locations, location, setLocationId } = useCurrentLocation()
  if (locations.length === 0) return null

  return (
    <div className="relative">
      <MapPin
        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-accent"
        aria-hidden="true"
      />
      <label htmlFor="location-switcher" className="sr-only">
        Current location
      </label>
      <select
        id="location-switcher"
        value={location?.id ?? ''}
        onChange={(event) => setLocationId(event.target.value)}
        className={cn(
          controlStyles,
          'h-8 max-w-28 appearance-none pr-7 pl-7 text-[13px] font-medium sm:max-w-48',
        )}
      >
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name} ({l.code})
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
    </div>
  )
}
