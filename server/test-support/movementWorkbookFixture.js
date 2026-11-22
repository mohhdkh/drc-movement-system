const fs = require('node:fs/promises')
const JSZip = require('jszip')

function xmlText(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function inlineCell(reference, value) {
  return `<c r="${reference}" t="inlineStr"><is><t>${xmlText(value)}</t></is></c>`
}

function worksheet(rows = '') {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`
}

async function createMovementWorkbookFixture(filePath, { sheets, headers }) {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/>
      <Override PartName="/xl/vbaProject.bin" ContentType="application/vnd.ms-office.vbaProject"/>
    </Types>`)
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8"?>
    <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
      xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <sheets>${sheets.map((name, index) => `<sheet name="${xmlText(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets>
    </workbook>`)
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      ${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}
    </Relationships>`)
  zip.file('xl/sharedStrings.xml', `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"/>`)
  zip.file('xl/vbaProject.bin', Buffer.from('synthetic-test-vba-project'))

  for (let index = 0; index < sheets.length; index += 1) {
    let rows = ''
    if (sheets[index] === 'Movement Tracker') {
      const headerCells = headers.map((header, column) => inlineCell(`${columnName(column)}2`, header)).join('')
      const prototypeCells = Array.from({ length: 68 }, (_, column) => `<c r="${columnName(column)}4"/>`).join('')
      rows = `<row r="2">${headerCells}</row><row r="4">${prototypeCells}</row>`
    } else if (sheets[index] === 'Purpose') {
      rows = `<row r="2">${inlineCell('A2', 'Visit to a GSK distribution point SG')}${inlineCell('B2', 'DIS')}</row>`
    }
    zip.file(`xl/worksheets/sheet${index + 1}.xml`, worksheet(rows))
  }

  await fs.writeFile(filePath, await zip.generateAsync({ type: 'nodebuffer' }))
}

function columnName(index) {
  let value = index + 1
  let name = ''
  while (value) {
    const remainder = (value - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    value = Math.floor((value - 1) / 26)
  }
  return name
}

module.exports = { createMovementWorkbookFixture }
