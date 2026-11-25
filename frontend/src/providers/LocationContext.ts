import { createContext, useContext } from 'react'
import type { Location, UUID } from '@/api/types'

export interface LocationContextValue {
  locations: Location[]
  /** The location the POS sells from and inventory defaults to; null if none exist. */
  location: Location | null
  setLocationId: (id: UUID) => void
  isLoading: boolean
}

export const LocationContext = createContext<LocationContextValue | null>(null)

export function useCurrentLocation(): LocationContextValue {
  const context = useContext(LocationContext)
  if (!context) throw new Error('useCurrentLocation must be used inside <LocationProvider>')
  return context
}
