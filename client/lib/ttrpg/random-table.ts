export interface RandomTableRow { label: string; result: string; weight: number }
export interface RandomTable { die: string; rows: RandomTableRow[]; totalWeight: number }

/** Legacy tables have one equally likely result per line. A `Weight | Result`
 * header enables explicit positive weights without changing the saved block. */
export function parseRandomTable(content: string): RandomTable | null {
  const lines = content.split("\n").map((line) => line.trim()).filter((line) => line && !/^[-|\s:]+$/.test(line))
  if (lines.length < 2) return null
  const weighted = /^\|?\s*weight\s*\|/i.test(lines[0])
  const rows: RandomTableRow[] = []
  for (const [index, line] of lines.slice(1).entries()) {
    const parts = line.replace(/^\||\|$/g, "").split("|").map((part) => part.trim())
    if (weighted && parts.length < 2) return null
    const result = parts.at(-1) ?? ""
    if (!result) continue
    const weight = weighted ? Number(parts[0]) : 1
    if (!Number.isFinite(weight) || weight <= 0) return null
    rows.push({ label: weighted ? parts[0] : String(index + 1), result, weight })
  }
  if (!rows.length) return null
  return { die: weighted ? "weighted" : `d${rows.length}`, rows, totalWeight: rows.reduce((sum, row) => sum + row.weight, 0) }
}

export function rollRandomTable(table: RandomTable, random = Math.random): RandomTableRow {
  let remaining = random() * table.totalWeight
  for (const row of table.rows) {
    remaining -= row.weight
    if (remaining < 0) return row
  }
  return table.rows[table.rows.length - 1]
}
