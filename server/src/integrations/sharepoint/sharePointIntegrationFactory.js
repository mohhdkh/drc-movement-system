const { GraphClient } = require('../microsoftGraph/graphClient')
const { GraphTokenClient } = require('../microsoftGraph/graphTokenClient')
const { getSharePointConfig } = require('./sharePointConfig')
const { SharePointRepository } = require('./sharePointRepository')

function createSharePointIntegration({ config = getSharePointConfig(), transport, tokenTransport, sleep } = {}) {
  const tokenClient = new GraphTokenClient({
    tenantId: config.tenantId,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    ...(tokenTransport ? { transport: tokenTransport } : {}),
  })
  const graphClient = new GraphClient({
    tokenClient,
    ...(transport ? { transport } : {}),
    ...(sleep ? { sleep } : {}),
  })
  return {
    config,
    graphClient,
    repository: new SharePointRepository({ config, graphClient }),
    tokenClient,
  }
}

module.exports = { createSharePointIntegration }
