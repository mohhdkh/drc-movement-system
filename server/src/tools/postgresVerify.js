const { createPostgresPool, validatePostgresConnection } = require('../db/postgres/pool')
const { getCounts, getSnapshot } = require('../db/migration/sqliteSource')
const { getPostgresCounts } = require('../db/migration/sqliteToPostgres')
const { redact } = require('../services/logger')

function compareCounts(sourceCounts, targetCounts) {
  return {
    missing: Object.keys(sourceCounts).filter((key) => targetCounts[key] < sourceCounts[key]),
    extra: Object.fromEntries(Object.keys(sourceCounts)
      .filter((key) => targetCounts[key] > sourceCounts[key])
      .map((key) => [key, targetCounts[key] - sourceCounts[key]])),
  }
}

async function main() {
  const pool = createPostgresPool()
  try {
    await validatePostgresConnection(pool)
    const sqliteCounts = getCounts()
    const postgresCounts = await getPostgresCounts(pool)
    const comparison = compareCounts(sqliteCounts, postgresCounts)
    const mismatches = [...comparison.missing]
    const extraTargetCounts = comparison.extra
    const snapshot = getSnapshot()
    let representative = { checked: false }
    if (snapshot.movements.length) {
      const source = snapshot.movements[0]
      const movement = await pool.query('SELECT id, status, route_points FROM movements WHERE id=$1', [source.id])
      const segments = await pool.query(`
        SELECT id, arrival_time::text AS arrival_time, departure_time::text AS departure_time
        FROM movement_segments WHERE movement_id=$1 ORDER BY sequence_number
      `, [source.id])
      representative = {
        checked: true,
        movementId: source.id,
        matches: movement.rowCount === 1 && movement.rows[0].status === source.status &&
          JSON.stringify(movement.rows[0].route_points) === JSON.stringify(source.routePoints) &&
          segments.rowCount === source.segments.length && segments.rows.every((row, index) =>
            row.id === source.segments[index].id && row.arrival_time.slice(0, 5) === source.segments[index].arrivalTime &&
            row.departure_time.slice(0, 5) === source.segments[index].departureTime),
      }
      if (!representative.matches) mismatches.push('representativeMovement')
    }
    const orphans = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM movement_segments s LEFT JOIN movements m ON m.id=s.movement_id WHERE m.id IS NULL)::integer +
        (SELECT COUNT(*) FROM movement_segment_passengers p LEFT JOIN movement_segments s ON s.id=p.segment_id WHERE s.id IS NULL)::integer
        AS count
    `)
    if (orphans.rows[0].count) mismatches.push('relationships')
    console.log(JSON.stringify({
      sqliteCounts,
      postgresCounts,
      extraTargetCounts,
      representative,
      orphanCount: orphans.rows[0].count,
      mismatches,
    }, null, 2))
    if (mismatches.length) throw new Error(`PostgreSQL verification failed: ${mismatches.join(', ')}`)
    console.log('PostgreSQL verification passed.')
  } finally {
    await pool.end()
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(redact(error.message))
    process.exitCode = 1
  })
}

module.exports = { compareCounts, main }
