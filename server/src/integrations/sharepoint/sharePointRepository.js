const { GraphIntegrationError } = require('../microsoftGraph/GraphIntegrationError')
const { validateSharePointConfig } = require('./sharePointConfig')
const { SHAREPOINT_LISTS } = require('./sharePointSchema')

function safeFields(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))
}

class SharePointRepository {
  constructor({ graphClient, config, schema = SHAREPOINT_LISTS }) {
    this.graphClient = graphClient
    this.config = config
    this.schema = schema
    this.site = null
    this.listCache = null
  }

  assertEnabled() {
    if (!this.config.enabled) {
      throw new GraphIntegrationError('SharePoint integration is disabled.', {
        code: 'SHAREPOINT_DISABLED', statusCode: 503,
      })
    }
    const missing = validateSharePointConfig(this.config)
    if (missing.length) {
      throw new GraphIntegrationError(`SharePoint configuration is incomplete: ${missing.join(', ')}.`, {
        code: 'SHAREPOINT_CONFIG_INVALID', statusCode: 503,
      })
    }
  }

  async resolveSite() {
    this.assertEnabled()
    if (this.site) return this.site
    const path = this.config.siteId
      ? `/sites/${encodeURIComponent(this.config.siteId)}`
      : `/sites/${this.config.hostname}:/${this.config.sitePath.replace(/^\/+|\/+$/g, '')}`
    this.site = await this.graphClient.request({ path })
    return this.site
  }

  async listSharePointLists({ refresh = false } = {}) {
    if (this.listCache && !refresh) return this.listCache
    const site = await this.resolveSite()
    const lists = await this.graphClient.getAll(`/sites/${encodeURIComponent(site.id)}/lists?$select=id,displayName`)
    this.listCache = new Map(lists.map((list) => [list.displayName, list]))
    return this.listCache
  }

  async getList(listName) {
    const definition = this.schema[listName]
    if (!definition) throw new GraphIntegrationError(`Unknown SharePoint mapping: ${listName}.`, { code: 'SHAREPOINT_MAPPING_ERROR' })
    const list = (await this.listSharePointLists()).get(definition.displayName)
    if (!list) {
      throw new GraphIntegrationError(`Required SharePoint list is missing: ${definition.displayName}.`, {
        code: 'SHAREPOINT_LIST_MISSING', statusCode: 503,
      })
    }
    return list
  }

  async verifySchema() {
    if (!this.config.enabled) {
      return {
        enabled: false, connected: false, siteResolved: false, siteDisplayName: null,
        requiredListsPresent: false, missingLists: Object.values(this.schema).map((item) => item.displayName),
        missingColumns: {}, errorCode: 'SHAREPOINT_DISABLED', message: 'SharePoint integration is disabled.',
      }
    }
    const site = await this.resolveSite()
    const lists = await this.listSharePointLists({ refresh: true })
    const missingLists = []
    const missingColumns = {}
    for (const definition of Object.values(this.schema)) {
      const list = lists.get(definition.displayName)
      if (!list) {
        missingLists.push(definition.displayName)
        continue
      }
      const columns = await this.graphClient.getAll(
        `/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(list.id)}/columns?$select=name,displayName`,
      )
      const names = new Set(columns.flatMap((column) => [column.name, column.displayName]))
      const missing = definition.columns.filter((column) => !names.has(column.name)).map((column) => column.name)
      if (missing.length) missingColumns[definition.displayName] = missing
    }
    const complete = missingLists.length === 0 && Object.keys(missingColumns).length === 0
    return {
      enabled: true, connected: true, siteResolved: true, siteDisplayName: site.displayName || site.name || null,
      requiredListsPresent: complete, missingLists, missingColumns, errorCode: complete ? null : 'SHAREPOINT_SCHEMA_INCOMPLETE',
      message: complete ? 'SharePoint schema is ready.' : 'SharePoint schema is missing required lists or columns.',
    }
  }

  async provision() {
    this.assertEnabled()
    const site = await this.resolveSite()
    let lists = await this.listSharePointLists({ refresh: true })
    const createdLists = []
    const createdColumns = []
    for (const definition of Object.values(this.schema)) {
      let list = lists.get(definition.displayName)
      if (!list) {
        list = await this.graphClient.request({
          method: 'POST', path: `/sites/${encodeURIComponent(site.id)}/lists`,
          data: { displayName: definition.displayName, columns: definition.columns, list: { template: 'genericList' } },
        })
        createdLists.push(definition.displayName)
        this.listCache = null
        lists = await this.listSharePointLists({ refresh: true })
        list = lists.get(definition.displayName) || list
        continue
      }
      const columns = await this.graphClient.getAll(
        `/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(list.id)}/columns?$select=name,displayName`,
      )
      const names = new Set(columns.flatMap((column) => [column.name, column.displayName]))
      for (const column of definition.columns.filter((item) => !names.has(item.name))) {
        await this.graphClient.request({
          method: 'POST', path: `/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(list.id)}/columns`, data: column,
        })
        createdColumns.push(`${definition.displayName}.${column.name}`)
      }
    }
    return { createdLists, createdColumns, verification: await this.verifySchema() }
  }

  async readItems(listName) {
    const site = await this.resolveSite()
    const list = await this.getList(listName)
    return this.graphClient.getAll(
      `/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(list.id)}/items?$expand=fields`,
    )
  }

  async upsert(listName, fields) {
    const definition = this.schema[listName]
    const key = fields[definition.keyField]
    if (!key) throw new GraphIntegrationError(`Missing stable key ${definition.keyField} for ${definition.displayName}.`, { code: 'SHAREPOINT_MAPPING_ERROR' })
    const site = await this.resolveSite()
    const list = await this.getList(listName)
    const matches = (await this.readItems(listName)).filter((item) => item.fields?.[definition.keyField] === key)
    if (matches.length > 1) {
      throw new GraphIntegrationError(`Duplicate SharePoint records found for ${definition.displayName}:${key}.`, {
        code: 'SHAREPOINT_DUPLICATE_DOMAIN_ID', statusCode: 409,
      })
    }
    if (matches.length === 1) {
      const remoteUpdatedAt = Date.parse(matches[0].fields?.UpdatedAt)
      const localUpdatedAt = Date.parse(fields.UpdatedAt)
      if (Number.isFinite(remoteUpdatedAt) && Number.isFinite(localUpdatedAt) && remoteUpdatedAt > localUpdatedAt) {
        throw new GraphIntegrationError(`SharePoint contains a newer ${definition.displayName} record for ${key}.`, {
          code: 'SHAREPOINT_REMOTE_NEWER', statusCode: 409,
        })
      }
      await this.graphClient.request({
        method: 'PATCH',
        path: `/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(list.id)}/items/${encodeURIComponent(matches[0].id)}/fields`,
        data: safeFields(fields),
      })
      return { action: 'updated', itemId: matches[0].id, domainId: key }
    }
    const created = await this.graphClient.request({
      method: 'POST', path: `/sites/${encodeURIComponent(site.id)}/lists/${encodeURIComponent(list.id)}/items`,
      data: { fields: safeFields(fields) },
    })
    return { action: 'created', itemId: created.id, domainId: key }
  }

  async syncMappedRecords(mappedRecords) {
    const completed = []
    for (const listName of Object.keys(this.schema)) {
      for (const fields of mappedRecords[listName] || []) {
        try {
          completed.push({ listName, ...(await this.upsert(listName, fields)) })
        } catch (error) {
          throw new GraphIntegrationError('SharePoint synchronization stopped after a partial write.', {
            code: 'SHAREPOINT_PARTIAL_WRITE', statusCode: 502,
            details: { completed, failedList: listName, causeCode: error.code || 'UNKNOWN' },
          })
        }
      }
    }
    return completed
  }
}

module.exports = { SharePointRepository, safeFields }
