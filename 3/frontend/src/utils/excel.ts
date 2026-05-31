import * as XLSX from 'xlsx'

export const exportToExcel = (data: any[], filename: string, columns: any[]): void => {
  const exportData = data.map(item => {
    const row: any = {}
    columns.forEach(col => {
      const key = col.dataIndex || col.key
      if (col.render) {
        row[col.title] = col.render(item[key], item, data.indexOf(item))
      } else {
        row[col.title] = item[key]
      }
    })
    return row
  })

  const worksheet = XLSX.utils.json_to_sheet(exportData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')
  XLSX.writeFile(workbook, `${filename}.xlsx`)
}

export const parseExcel = async (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'binary' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet)
        resolve(jsonData)
      } catch (error) {
        reject(error)
      }
    }
    reader.onerror = reject
    reader.readAsBinaryString(file)
  })
}
