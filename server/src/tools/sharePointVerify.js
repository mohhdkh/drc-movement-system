const { createPersistenceProviders } = require('../integrations/sharepoint/persistenceProvider')

async function main() {
  const { sharePoint } = createPersistenceProviders()
  const report = await sharePoint.verify()
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(JSON.stringify({ errorCode: error.code || 'VERIFY_FAILED', message: error.message }, null, 2))
  process.exitCode = 1
})
