const { createPersistenceProviders } = require('../integrations/sharepoint/persistenceProvider')
const { SHAREPOINT_LISTS } = require('../integrations/sharepoint/sharePointSchema')

async function main() {
  const { sharePoint } = createPersistenceProviders()
  if (!sharePoint.config.enabled) {
    console.log(JSON.stringify({
      enabled: false,
      changed: false,
      message: 'SharePoint integration is disabled. No changes were made.',
      schema: Object.values(SHAREPOINT_LISTS).map((list) => ({
        displayName: list.displayName,
        keyField: list.keyField,
        columns: list.columns.map((column) => column.name),
      })),
    }, null, 2))
    return
  }
  console.log(JSON.stringify(await sharePoint.provision(), null, 2))
}

main().catch((error) => {
  console.error(JSON.stringify({ errorCode: error.code || 'PROVISION_FAILED', message: error.message }, null, 2))
  process.exitCode = 1
})
