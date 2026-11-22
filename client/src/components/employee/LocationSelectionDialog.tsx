import { useEffect, useMemo, useRef, useState } from 'react'
import type { Location } from '../../types'

interface LocationSelectionDialogProps {
  isOpen: boolean
  title: string
  locations: Location[]
  selectedLocationId?: string
  onSelect: (location: Location) => void
  onClose: () => void
}

export function LocationSelectionDialog({ isOpen, title, locations, selectedLocationId, onSelect, onClose }: LocationSelectionDialogProps) {
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const filteredLocations = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    if (!normalizedQuery) return []
    return locations.filter((location) => location.name.toLocaleLowerCase().includes(normalizedQuery))
  }, [locations, query])

  useEffect(() => {
    if (isOpen) window.setTimeout(() => searchRef.current?.focus(), 0)
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="employee-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="employee-dialog" role="dialog" aria-modal="true" aria-labelledby="location-dialog-title">
        <div className="employee-dialog-heading">
          <h2 id="location-dialog-title">{title}</h2>
          <button type="button" className="button button-quiet" onClick={onClose}>Close</button>
        </div>
        <label className="visually-hidden" htmlFor="location-dialog-search">Search location</label>
        <input
          ref={searchRef}
          id="location-dialog-search"
          className="employee-dialog-search"
          value={query}
          placeholder="Search location..."
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="employee-dialog-list" role="listbox" aria-label="Locations">
          {!query.trim() ? <p className="employee-dialog-empty">Type to search locations</p> : filteredLocations.length === 0 ? <p className="employee-dialog-empty">No matching locations</p> : filteredLocations.map((location) => (
            <button
              type="button"
              role="option"
              aria-selected={location.id === selectedLocationId}
              className="employee-dialog-option"
              key={location.id}
              onClick={() => { onSelect(location); onClose() }}
            >
              <span className="employee-dialog-option-details"><strong>{location.name}</strong></span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
