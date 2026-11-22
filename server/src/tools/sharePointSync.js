const { createPersistenceProviders } = require('../integrations/sharepoint/persistenceProvider')

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const { sharePoint } = createPersistenceProviders()
  const summary = sharePoint.dryRunSummary()
  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, writesPerformed: 0, summary }, null, 2))
    return
  }
  if (!sharePoint.config.enabled) throw new Error('SharePoint integration is disabled; synchronization was not started.')
  const operations = await sharePoint.syncSnapshot()
  console.log(JSON.stringify({ dryRun: false, writesPerformed: operations.length, summary }, null, 2))
}

main().catch((error) => {
  console.error(JSON.stringify({ errorCode: error.code || 'SYNC_FAILED', message: error.message }, null, 2))
  process.exitCode = 1
})
