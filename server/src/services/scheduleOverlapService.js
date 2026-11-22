function timesOverlap(firstStart, firstEnd, secondStart, secondEnd) {
  return firstStart < secondEnd && firstEnd > secondStart
}

module.exports = { timesOverlap }

