export const MOVEMENT_TIME_OPTIONS = Array.from({ length: 193 }, (_, index) => {
  const totalMinutes = 6 * 60 + index * 5
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
})
