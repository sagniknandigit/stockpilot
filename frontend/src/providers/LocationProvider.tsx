import { useMemo, useState, type ReactNode } from 'react'
import type { UUID } from '@/api/types'
import { useLocations } from '@/hooks/useInventory'
import { readStorage, writeStorage } from '@/lib/utils'
import { LocationContext, type LocationContextValue } from './LocationContext'

const STORAGE_KEY = 'stockpilot.location'

/** Tracks the selected store location, persisted per browser (a till usually stays put). */
export function LocationProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useLocations()
  const [selectedId, setSelectedId] = useState<UUID | null>(() => readStorage<UUID>(STORAGE_KEY))

  const value = useMemo<LocationContextValue>(() => {
    const locations = (data ?? []).filter((location) => location.is_active)
    // Fall back to the first location if the saved one was removed or belongs to another org.
    const location = locations.find((l) => l.id === selectedId) ?? locations[0] ?? null
    return {
      locations,
      location,
      isLoading,
      setLocationId: (id) => {
        setSelectedId(id)
        writeStorage(STORAGE_KEY, id)
      },
    }
  }, [data, isLoading, selectedId])

  return <LocationContext value={value}>{children}</LocationContext>
}
