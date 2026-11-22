export const MAX_SEGMENT_PASSENGERS = 7

export function inheritPassengers(passengersBySegment: string[][], vehicleLeaderId: string) {
  const source = passengersBySegment.at(-1) ?? (vehicleLeaderId ? [vehicleLeaderId] : [])
  return [...source].slice(0, MAX_SEGMENT_PASSENGERS)
}

export function setPassengerInSlot(
  passengersBySegment: string[][],
  segmentIndex: number,
  slotIndex: number,
  employeeId: string,
) {
  return passengersBySegment.map((passengerIds, index) => {
    if (index !== segmentIndex) return passengerIds
    if (passengerIds.includes(employeeId) && passengerIds[slotIndex] !== employeeId) return passengerIds
    const next = [...passengerIds]
    next[slotIndex] = employeeId
    return next.slice(0, MAX_SEGMENT_PASSENGERS)
  })
}

export function removePassengerFromSlot(
  passengersBySegment: string[][],
  segmentIndex: number,
  slotIndex: number,
) {
  return passengersBySegment.map((passengerIds, index) => (
    index === segmentIndex
      ? passengerIds.map((id, passengerIndex) => passengerIndex === slotIndex ? '' : id)
      : passengerIds
  ))
}
