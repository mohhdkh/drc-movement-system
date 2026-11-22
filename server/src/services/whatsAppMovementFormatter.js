function coordinatesText(coordinates) {
  if (!coordinates) return null
  return `${coordinates.latitude.toFixed(4)}, ${coordinates.longitude.toFixed(4)}`
}

function personText(person) {
  return person.phone ? `${person.name} - ${person.phone}` : person.name
}

function formatSegment(segment) {
  const lines = [
    `*${segment.code}*`,
    `من: ${segment.fromLocation}`,
  ]
  const fromCoordinates = coordinatesText(segment.fromCoordinates)
  if (fromCoordinates) lines.push(`إحداثيات الانطلاق: ${fromCoordinates}`)
  lines.push(`إلى: ${segment.toLocation}`)
  const toCoordinates = coordinatesText(segment.toCoordinates)
  if (toCoordinates) lines.push(`إحداثيات الوصول: ${toCoordinates}`)
  if (segment.arrivalTime) lines.push(`وقت الوصول: ${segment.arrivalTime}`)
  if (segment.departureTime) lines.push(`وقت المغادرة: ${segment.departureTime}`)
  if (segment.passengers.length) {
    lines.push(`ركاب المقطع (${segment.passengers.length}): ${segment.passengers.map(personText).join('، ')}`)
  }
  return lines.join('\n')
}

function formatWhatsAppMovement(movement) {
  const lines = [
    '*خطة حركة DRC*',
    `المرجع: ${movement.movementId}`,
    `التاريخ: ${movement.movementDate}`,
    `الحالة: معتمد نهائياً (${movement.status})`,
    '',
    `المركبة: ${movement.vehicle || 'غير محددة'}`,
    `موعد الانطلاق (ETD): ${movement.etd}`,
    `الغرض: ${movement.purpose}`,
  ]
  if (movement.driver) lines.push(`السائق: ${personText(movement.driver)}`)
  lines.push(`جهاز GPS: ${movement.gps.type === 'NO_GPS' ? 'بدون جهاز GPS' : movement.gps.label || 'غير محدد'}`)
  lines.push(`قائد المركبة: ${personText(movement.vehicleLeader)}`)
  lines.push(`عدد الركاب (Pax): ${movement.passengers.length}`)
  if (movement.passengers.length) {
    lines.push('', '*الركاب*')
    movement.passengers.forEach((passenger, index) => {
      lines.push(`${index + 1}. ${personText(passenger)}`)
    })
  }
  lines.push('', '*المسار*')
  movement.segments.forEach((segment, index) => {
    if (index) lines.push('')
    lines.push(formatSegment(segment))
  })
  return lines.join('\n')
}

module.exports = { coordinatesText, formatWhatsAppMovement, personText }
