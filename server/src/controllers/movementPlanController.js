const { createMovementPlanExport } = require('../services/movementPlanExportService')

async function downloadMovementPlan(request, response) {
  const result = await createMovementPlanExport({ movementId: request.query.movementId })
  response.set({
    'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="${result.filename}"`,
    'Content-Length': String(result.workbook.length),
    'Content-Type': 'application/vnd.ms-excel.sheet.macroEnabled.12',
  })
  response.send(result.workbook)
}

module.exports = { downloadMovementPlan }
