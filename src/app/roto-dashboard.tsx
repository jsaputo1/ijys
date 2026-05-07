"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type RotoCategoryDto = {
  id: string;
  label: string;
  higherIsBetter: boolean;
};

type TotalsRow = {
  teamId: string;
  teamName: string;
  stats: Record<string, number | null>;
};

type RotoRow = {
  rank: number;
  teamId: string;
  teamName: string;
  totalScore: number;
  statScores: Record<string, number>;
};

type InfoOk = {
  ok: true;
  weekBounds: { seasonStartWeek: number; currentWeek: number };
};

type InfoErr = {
  ok: false;
  error?: string;
};

type RotoOk = {
  ok: true;
  filters: { startWeek: number; endWeek: number };
  categories: RotoCategoryDto[];
  tables: {
    totals: TotalsRow[];
    roto: RotoRow[];
  };
};

type RotoErr = {
  ok: false;
  error?: string;
  details?: string;
};

function formatStat(catId: string, value: number | null): string {
  if (value === null) return "—";
  if (catId === "OBP") return value.toFixed(3);
  if (catId === "ERA" || catId === "WHIP") return value.toFixed(2);
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}

function rangeInclusive(from: number, to: number): number[] {
  if (to < from) return [];
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

type SortDir = "asc" | "desc";

function compareNullableNumbers(
  a: number | null,
  b: number | null,
  dir: SortDir,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const cmp = a - b;
  return dir === "asc" ? cmp : -cmp;
}

/** First click picks a direction that favors “fantasy best”: high stats desc, ERA/WHIP asc, alphabetical team asc. */
function defaultTotalsStatDir(cat: RotoCategoryDto | undefined): SortDir {
  if (!cat) return "desc";
  return cat.higherIsBetter ? "desc" : "asc";
}

/** First sort direction for standings: rank asc, totals desc; category points respect higherIsBetter. */
function defaultRotoSortDir(
  column: "rank" | "team" | "total" | RotoCategoryDto | undefined,
): SortDir {
  if (column === "team") return "asc";
  if (column === "rank") return "asc";
  if (column === "total") return "desc";
  if (column && typeof column === "object" && "higherIsBetter" in column) {
    return column.higherIsBetter ? "desc" : "asc";
  }
  return "desc";
}

function SortHeaderButton(props: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}) {
  const { label, active, dir, onClick, className = "" } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-max max-w-full items-center gap-1 rounded px-1 py-0.5 text-left font-semibold outline-none hover:bg-zinc-200/80 focus-visible:ring-2 focus-visible:ring-zinc-400 ${className}`}
    >
      <span>{label}</span>
      <span className="font-normal tabular-nums text-zinc-400" aria-hidden>
        {active ? (dir === "asc" ? "▲" : "▼") : " "}
      </span>
    </button>
  );
}

export function RotoDashboard() {
  const [bounds, setBounds] = useState<InfoOk["weekBounds"] | null>(null);
  const [boundsError, setBoundsError] = useState<string | null>(null);

  const [startWeek, setStartWeek] = useState<number | null>(null);
  const [endChoice, setEndChoice] = useState<number | "current" | null>(null);

  const [roto, setRoto] = useState<RotoOk | null>(null);
  const [rotoLoading, setRotoLoading] = useState(false);
  const [rotoError, setRotoError] = useState<string | null>(null);

  const [totalsSortCol, setTotalsSortCol] = useState<"team" | string>("team");
  const [totalsSortDir, setTotalsSortDir] = useState<SortDir>("asc");
  const [rotoSortCol, setRotoSortCol] = useState<
    "rank" | "team" | "total" | string
  >("total");
  const [rotoSortDir, setRotoSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    let cancelled = false;

    async function loadBounds() {
      setBoundsError(null);
      try {
        const res = await fetch("/api/yahoo/league/info", { cache: "no-store" });
        const body = (await res.json()) as InfoOk | InfoErr;
        if (!res.ok || !body.ok) {
          throw new Error(
            !body.ok ? (body.error ?? `HTTP ${res.status}`) : `HTTP ${res.status}`,
          );
        }
        if (cancelled) return;
        setBounds(body.weekBounds);
      } catch (e) {
        if (!cancelled) {
          setBoundsError(e instanceof Error ? e.message : "Failed to load league bounds.");
        }
      }
    }

    void loadBounds();
    return () => {
      cancelled = true;
    };
  }, []);

  const { startWeekOptions, endNumericWeeks, lastCompletedWeek } = useMemo(() => {
    if (!bounds) {
      return {
        startWeekOptions: [] as number[],
        endNumericWeeks: [] as number[],
        lastCompletedWeek: 0,
      };
    }
    const { seasonStartWeek, currentWeek } = bounds;
    const lastCmp = currentWeek - 1;
    const starts =
      lastCmp >= seasonStartWeek ? rangeInclusive(seasonStartWeek, lastCmp) : [];
    const endNums =
      lastCmp >= seasonStartWeek ? rangeInclusive(seasonStartWeek, lastCmp) : [];
    return {
      startWeekOptions: starts,
      endNumericWeeks: endNums,
      lastCompletedWeek: lastCmp,
    };
  }, [bounds]);

  useEffect(() => {
    if (!bounds) return;

    const defaultStart =
      startWeekOptions[0] ?? bounds.seasonStartWeek;
    setStartWeek(defaultStart);
    setEndChoice("current");
  }, [bounds, startWeekOptions]);

  const resolvedEndWeek =
    bounds && endChoice !== null
      ? endChoice === "current"
        ? bounds.currentWeek
        : endChoice
      : null;

  useEffect(() => {
    if (!bounds || startWeek === null || resolvedEndWeek === null) return;
    if (startWeek > resolvedEndWeek) {
      const clamped =
        startWeekOptions.length > 0
          ? [...startWeekOptions].filter((w) => w <= resolvedEndWeek).pop() ??
            bounds.seasonStartWeek
          : Math.min(bounds.seasonStartWeek, resolvedEndWeek);
      setStartWeek(clamped);
    }
  }, [bounds, startWeek, resolvedEndWeek, startWeekOptions]);

  const loadRoto = useCallback(async () => {
    if (!bounds || startWeek === null || resolvedEndWeek === null) return;
    if (startWeek > resolvedEndWeek) return;

    const apiStart = startWeek;
    const apiEnd = resolvedEndWeek;

    setRotoLoading(true);
    setRotoError(null);
    try {
      const url = new URL("/api/yahoo/league/roto", window.location.origin);
      url.searchParams.set("startWeek", String(apiStart));
      url.searchParams.set("endWeek", String(apiEnd));
      const res = await fetch(url.toString(), { cache: "no-store" });
      const body = (await res.json()) as RotoOk | RotoErr;
      if (!res.ok || !body.ok) {
        throw new Error(
          !body.ok
            ? [body.error, body.details].filter(Boolean).join(": ")
            : `HTTP ${res.status}`,
        );
      }
      setRoto(body);
    } catch (e) {
      setRoto(null);
      setRotoError(e instanceof Error ? e.message : "Failed to load roto.");
    } finally {
      setRotoLoading(false);
    }
  }, [bounds, startWeek, resolvedEndWeek]);

  useEffect(() => {
    void loadRoto();
  }, [loadRoto]);

  const sortedTotalsRows = useMemo(() => {
    if (!roto?.tables?.totals?.length) return [];
    const rows = [...roto.tables.totals];
    rows.sort((a, b) => {
      if (totalsSortCol === "team") {
        const cmp = a.teamName.localeCompare(b.teamName, undefined, {
          sensitivity: "base",
        });
        return totalsSortDir === "asc" ? cmp : -cmp;
      }
      const va = a.stats[totalsSortCol] ?? null;
      const vb = b.stats[totalsSortCol] ?? null;
      return compareNullableNumbers(va, vb, totalsSortDir);
    });
    return rows;
  }, [roto, totalsSortCol, totalsSortDir]);

  const sortedRotoRows = useMemo(() => {
    if (!roto?.tables?.roto?.length) return [];
    const rows = [...roto.tables.roto];
    rows.sort((a, b) => {
      if (rotoSortCol === "rank") {
        return compareNullableNumbers(a.rank, b.rank, rotoSortDir);
      }
      if (rotoSortCol === "team") {
        const cmp = a.teamName.localeCompare(b.teamName, undefined, {
          sensitivity: "base",
        });
        return rotoSortDir === "asc" ? cmp : -cmp;
      }
      if (rotoSortCol === "total") {
        return compareNullableNumbers(a.totalScore, b.totalScore, rotoSortDir);
      }
      const va = a.statScores[rotoSortCol] ?? null;
      const vb = b.statScores[rotoSortCol] ?? null;
      return compareNullableNumbers(va, vb, rotoSortDir);
    });
    return rows;
  }, [roto, rotoSortCol, rotoSortDir]);

  const onTotalsSortClick = useCallback(
    (colId: string) => {
      if (colId === totalsSortCol) {
        setTotalsSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return;
      }
      setTotalsSortCol(colId);
      if (colId === "team") {
        setTotalsSortDir("asc");
        return;
      }
      const cat = roto?.categories.find((c) => c.id === colId);
      setTotalsSortDir(defaultTotalsStatDir(cat));
    },
    [roto?.categories, totalsSortCol],
  );

  const onRotoSortClick = useCallback(
    (colKey: "rank" | "team" | "total" | string) => {
      if (colKey === rotoSortCol) {
        setRotoSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return;
      }
      setRotoSortCol(colKey);
      if (colKey === "rank") {
        setRotoSortDir(defaultRotoSortDir("rank"));
        return;
      }
      if (colKey === "team") {
        setRotoSortDir(defaultRotoSortDir("team"));
        return;
      }
      if (colKey === "total") {
        setRotoSortDir(defaultRotoSortDir("total"));
        return;
      }
      const cat = roto?.categories.find((c) => c.id === colKey);
      setRotoSortDir(defaultRotoSortDir(cat));
    },
    [roto?.categories, rotoSortCol],
  );

  if (boundsError) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {boundsError}
      </p>
    );
  }

  if (!bounds) {
    return (
      <p className="text-sm text-zinc-500">
        Loading league week range…
      </p>
    );
  }

  const { seasonStartWeek, currentWeek } = bounds;
  const endSelectValue =
    endChoice === "current" ? "current" : endChoice === null ? "" : String(endChoice);

  const startSelectValue =
    startWeekOptions.length === 0
      ? ""
      : startWeek !== null && startWeekOptions.includes(startWeek)
        ? String(startWeek)
        : String(startWeekOptions[0]);

  return (
    <div className="flex w-full flex-col gap-10">
      <div className="flex flex-wrap items-end gap-6">
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-900">
          Start week
          <select
            className="min-w-[10rem] rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 shadow-sm outline-none ring-zinc-400 focus:ring-2"
            disabled={startWeekOptions.length === 0}
            value={startSelectValue}
            onChange={(e) => {
              const v = Number.parseInt(e.target.value, 10);
              if (Number.isFinite(v)) setStartWeek(v);
            }}
          >
            {startWeekOptions.length === 0 ? (
              <option value="">No prior weeks yet</option>
            ) : (
              startWeekOptions.map((w) => (
                <option key={w} value={w}>
                  Week {w}
                </option>
              ))
            )}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-900">
          End week
          <select
            className="min-w-[10rem] rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 shadow-sm outline-none ring-zinc-400 focus:ring-2"
            value={endSelectValue}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "current") setEndChoice("current");
              else {
                const v = Number.parseInt(raw, 10);
                if (Number.isFinite(v)) setEndChoice(v);
              }
            }}
          >
            {endNumericWeeks.map((w) => (
              <option key={w} value={w}>
                Week {w}
              </option>
            ))}
            <option value="current">Current</option>
          </select>
        </label>

        {rotoLoading ? (
          <span className="text-sm text-zinc-500">Updating…</span>
        ) : null}
      </div>

      {rotoError ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {rotoError}
        </p>
      ) : null}

      {!roto && !rotoError && rotoLoading ? (
        <p className="text-sm text-zinc-500">Loading tables…</p>
      ) : null}

      {roto?.categories?.length ? (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-zinc-900">
              Category totals
            </h2>
            <p className="text-sm text-zinc-500">
              Weeks {roto.filters.startWeek}–{roto.filters.endWeek}.
            </p>
            <div className="-mx-1 overflow-x-auto rounded-lg border border-zinc-200">
              <table className="min-w-max w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th
                      className="sticky left-0 z-10 bg-zinc-50 px-3 py-2 text-zinc-900"
                      aria-sort={
                        totalsSortCol === "team"
                          ? totalsSortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <SortHeaderButton
                        label="Team"
                        active={totalsSortCol === "team"}
                        dir={totalsSortDir}
                        onClick={() => onTotalsSortClick("team")}
                      />
                    </th>
                    {roto.categories.map((c) => (
                      <th
                        key={c.id}
                        className="whitespace-nowrap px-3 py-2 text-zinc-900"
                        aria-sort={
                          totalsSortCol === c.id
                            ? totalsSortDir === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                        }
                      >
                        <SortHeaderButton
                          label={c.label}
                          active={totalsSortCol === c.id}
                          dir={totalsSortDir}
                          onClick={() => onTotalsSortClick(c.id)}
                        />
                      </th>
                    ))}
                    <th className="whitespace-nowrap px-3 py-2 text-right font-semibold text-zinc-900">
                      Row
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTotalsRows.map((row, rowIndex) => (
                    <tr
                      key={row.teamId}
                      className="border-b border-zinc-100"
                    >
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2 text-zinc-700">
                        {row.teamName}
                      </td>
                      {roto.categories.map((c) => (
                        <td
                          key={c.id}
                          className="whitespace-nowrap px-3 py-2 tabular-nums text-zinc-700"
                        >
                          {formatStat(c.id, row.stats[c.id] ?? null)}
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-zinc-600">
                        {rowIndex + 1}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-zinc-900">
              Frankings
            </h2>
            <div className="-mx-1 overflow-x-auto rounded-lg border border-zinc-200">
              <table className="min-w-max w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th
                      className="sticky left-0 z-20 w-[2rem] min-w-[2rem] max-w-[2rem] lg:w-[5rem] lg:min-w-[5rem] lg:min-w-[5rem] whitespace-nowrap bg-zinc-50 px-3 py-2 text-zinc-900 shadow-[6px_0_8px_-6px_rgba(0,0,0,0.12)]"
                      aria-sort={
                        rotoSortCol === "rank"
                          ? rotoSortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <SortHeaderButton
                        label="Rank"
                        active={rotoSortCol === "rank"}
                        dir={rotoSortDir}
                        onClick={() => onRotoSortClick("rank")}
                      />
                    </th>
                    <th
                      className="sticky left-[2.5rem] z-10 whitespace-nowrap bg-zinc-50 px-3 py-2 text-zinc-900 shadow-[6px_0_8px_-6px_rgba(0,0,0,0.12)]"
                      aria-sort={
                        rotoSortCol === "team"
                          ? rotoSortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <SortHeaderButton
                        label="Team"
                        active={rotoSortCol === "team"}
                        dir={rotoSortDir}
                        onClick={() => onRotoSortClick("team")}
                      />
                    </th>
                    <th
                      className="whitespace-nowrap px-3 py-2 text-zinc-900"
                      aria-sort={
                        rotoSortCol === "total"
                          ? rotoSortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <SortHeaderButton
                        label="Total"
                        active={rotoSortCol === "total"}
                        dir={rotoSortDir}
                        onClick={() => onRotoSortClick("total")}
                      />
                    </th>
                    {roto.categories.map((c) => (
                      <th
                        key={c.id}
                        className="whitespace-nowrap px-3 py-2 text-zinc-900"
                        aria-sort={
                          rotoSortCol === c.id
                            ? rotoSortDir === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                        }
                      >
                        <SortHeaderButton
                          label={c.label}
                          active={rotoSortCol === c.id}
                          dir={rotoSortDir}
                          onClick={() => onRotoSortClick(c.id)}
                        />
                      </th>
                    ))}
                    <th className="whitespace-nowrap px-3 py-2 text-right font-semibold text-zinc-900">
                      Row
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRotoRows.map((row, rowIndex) => (
                    <tr
                      key={row.teamId}
                      className="border-b border-zinc-100"
                    >
                      <td className="sticky left-0 z-20 w-[2rem] min-w-[2rem] max-w-[2rem] lg:w-[5rem] lg:min-w-[5rem] lg:min-w-[5rem] whitespace-nowrap bg-white px-3 py-2 tabular-nums text-zinc-700 shadow-[6px_0_8px_-6px_rgba(0,0,0,0.08)]">
                        {row.rank}
                      </td>
                      <td className="sticky left-[2.5rem] z-10 whitespace-nowrap bg-white px-3 py-2 text-zinc-700 shadow-[6px_0_8px_-6px_rgba(0,0,0,0.08)]">
                        {row.teamName}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums font-medium text-zinc-900">
                        {row.totalScore.toFixed(2)}
                      </td>
                      {roto.categories.map((c) => (
                        <td
                          key={c.id}
                          className="whitespace-nowrap px-3 py-2 tabular-nums text-zinc-700"
                        >
                          {(row.statScores[c.id] ?? 0).toFixed(2)}
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-zinc-600">
                        {rowIndex + 1}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
