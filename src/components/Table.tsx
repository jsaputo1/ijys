import { useEffect, useMemo, useRef, useState } from "react";
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

  /** Index into `sortedData`; toggles off when the same row is clicked again. */
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const tableRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (selectedRowIndex === null) return;
      const root = tableRootRef.current;
      const target = event.target;
      if (
        root &&
        target instanceof Node &&
        !root.contains(target)
      ) {
        setSelectedRowIndex(null);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [selectedRowIndex]);

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
    <div ref={tableRootRef} className="max-w-6xl">
      <table className="table-component bg-zinc-800">
        <thead className="bg-slate-700/50">
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                onClick={() => handleSort(column)}
                className={[
                  column === doNotSortKey ? "table-col-nosort" : "",
                  sortConfig?.key === column ? "active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")
                  .trim() || undefined}
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
            <tr
              key={rowIndex}
              className={selectedRowIndex === rowIndex ? "active" : undefined}
              onClick={() =>
                setSelectedRowIndex((prev) =>
                  prev === rowIndex ? null : rowIndex,
                )
              }
            >
              {columns.map((column) => (
                <td
                  key={column}
                  className={
                    sortConfig?.key === column ? "active" : undefined
                  }
                >
                  {row[column]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs mt-3 bg-zinc-800 bg-[#3f3f46] inline-block p-2 border-1 border-zinc-700">
        Sorted by:{" "}
        {sortConfig ? (
          <>
            <span className="ml-[1px]">{sortConfig.key} {sortConfig.direction === "asc" ? "Asc" : "Desc"}</span>
          </>
        ) : (
          "—"
        )}
      </p>
    </div>
  );
}


