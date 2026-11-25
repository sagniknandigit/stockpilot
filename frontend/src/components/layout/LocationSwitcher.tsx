import { MapPin } from 'lucide-react'
import { useCurrentLocation } from '@/providers/LocationContext'
import { controlStyles } from '@/components/ui/Input'
import { cn } from '@/lib/utils'

export function LocationSwitcher() {
  const { locations, location, setLocationId } = useCurrentLocation()
  if (locations.length === 0) return null

  return (
    <div className="relative">
      <MapPin
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted"
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
          'h-8 max-w-48 appearance-none pr-3 pl-8 text-[13px] font-medium',
        )}
      >
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name} ({l.code})
          </option>
        ))}
      </select>
    </div>
  )
}
