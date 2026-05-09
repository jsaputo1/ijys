import { useMemo, useState } from "react";
import "./Table.scss";

type TableProps = {
  columns: string[];
  data: Array<Record<string, string | number>>;
  defaultSortCol?: number;
  doNotSortCol?: number;
};

type SortDirection = "asc" | "desc";
type SortConfig = { key: string; direction: SortDirection } | null;

export function Table({
  columns,
  data,
  defaultSortCol,
  doNotSortCol,
}: TableProps) {
  const doNotSortIndex =
    doNotSortCol !== undefined ? doNotSortCol - 1 : undefined;
  const doNotSortKey =
    doNotSortIndex !== undefined &&
      doNotSortIndex >= 0 &&
      doNotSortIndex < columns.length
      ? columns[doNotSortIndex]
      : undefined;

  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    if (defaultSortCol === undefined) return null;
    const defaultIndex = defaultSortCol - 1;
    if (defaultIndex < 0 || defaultIndex >= columns.length) return null;
    return { key: columns[defaultIndex], direction: "desc" };
  });

  const handleSort = (column: string) => {
    if (column === doNotSortKey) return;

    setSortConfig((prev) => {
      if (!prev || prev.key !== column) {
        return { key: column, direction: "asc" };
      }
      return {
        key: column,
        direction: prev.direction === "asc" ? "desc" : "asc",
      };
    });
  };

  const sortedData = useMemo(() => {
    if (!sortConfig) return data;

    const { key, direction } = sortConfig;

    return [...data].sort((a, b) => {
      const valueA = a[key];
      const valueB = b[key];

      if (typeof valueA === "number" && typeof valueB === "number") {
        return direction === "asc" ? valueA - valueB : valueB - valueA;
      }

      const sortValueA = String(valueA ?? "");
      const sortValueB = String(valueB ?? "");

      return direction === "asc"
        ? sortValueA.localeCompare(sortValueB, undefined, {
          sensitivity: "base",
          numeric: true,
        })
        : sortValueB.localeCompare(sortValueA, undefined, {
          sensitivity: "base",
          numeric: true,
        });
    });
  }, [data, sortConfig]);

  return (
    <div className="max-w-6xl">
      <table className="table-component bg-zinc-800">
        <thead className="bg-slate-700/50">
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                onClick={() => handleSort(column)}
                className={column === doNotSortKey ? "table-col-nosort" : undefined}
              >
                {column}
                {column !== doNotSortKey && sortConfig?.key === column
                  ? sortConfig.direction === "asc"
                    ? " ▲"
                    : " ▼"
                  : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column) => (
                <td key={column}>{row[column]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
