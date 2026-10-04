import { cn } from "@/lib/utils"

import { FIGURE_TYPE } from "./chart-tokens"

import type { ReactNode } from "react"

export interface DataTableColumn {
  readonly key: string
  readonly label: string
  readonly numeric?: boolean
}

export interface DataTableProps {
  readonly columns: readonly DataTableColumn[]
  readonly rows: readonly (readonly (string | number)[])[]
  readonly caption: string
  readonly note?: ReactNode
  readonly className?: string
}

export function DataTable({ caption, className, columns, note, rows }: DataTableProps) {
  return (
    <div className={cn("pt-3", className)}>
      <div className="bg-surface-2 max-h-[21rem] overflow-auto rounded-lg">
        <table className={cn(FIGURE_TYPE.table, "w-full border-collapse text-left")}>
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-surface-2 sticky top-0 z-10">
            <tr>
              {columns.map((column) => (
                <th
                  className={cn(
                    "border-border text-muted-foreground border-b px-4 pt-3 pb-2 font-medium whitespace-nowrap",
                    column.numeric && "text-right",
                  )}
                  key={column.key}
                  scope="col"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td
                    className={cn(
                      "text-foreground px-4 py-2 whitespace-nowrap",
                      columns[cellIndex]?.numeric && "text-right tabular-nums",
                    )}
                    key={cellIndex}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note !== undefined && (
        <div className={cn(FIGURE_TYPE.footnote, "text-muted-foreground mt-2.5")}>{note}</div>
      )}
    </div>
  )
}
