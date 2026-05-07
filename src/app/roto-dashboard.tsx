"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  if (catId === "OBP") return value.toFixed(3).replace(/^0(?=\.)/, "");
  if (catId === "ERA" || catId === "WHIP") return value.toFixed(2);
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}

function rangeInclusive(from: number, to: number): number[] {
  if (to < from) return [];
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

type SortDir = "asc" | "desc";
type SelectedRow = { table: "totals" | "roto"; teamId: string } | null;

function tsvCell(value: string | number): string {
  return String(value).replace(/\t/g, " ").replace(/\r?\n/g, " ");
}

function csvCell(value: string | number): string {
  const raw = String(value);
  const escaped = raw.replace(/"/g, '""');
  return /[",\r\n]/.test(raw) ? `"${escaped}"` : escaped;
}

function toTsv(headers: string[], rows: Array<Array<string | number>>): string {
  return [headers.map(tsvCell).join("\t"), ...rows.map((r) => r.map(tsvCell).join("\t"))].join(
    "\n",
  );
}

function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  return [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join(
    "\n",
  );
}

function downloadTextFile(filename: string, mimeType: string, content: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

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
  column: "team" | "total" | "change" | RotoCategoryDto | undefined,
): SortDir {
  if (column === "team") return "asc";
  if (column === "total") return "desc";
  if (column === "change") return "desc";
  if (column && typeof column === "object" && "higherIsBetter" in column) {
    return column.higherIsBetter ? "desc" : "asc";
  }
  return "desc";
}

/** Δ total roto vs same start week through previous week (end − 1). Null when unavailable. */
function formatTotalChange(delta: number | null): string {
  if (delta === null || Number.isNaN(delta)) return "—";
  const rounded = Number(delta.toFixed(2));
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(2)}`;
}

function weeklyTotalDelta(
  row: RotoRow,
  prevTotalsByTeam: Record<string, number> | null,
): number | null {
  if (!prevTotalsByTeam) return null;
  const prev = prevTotalsByTeam[row.teamId];
  if (prev === undefined) return null;
  return row.totalScore - prev;
}

function SortHeaderButton(props: {
  label: string;
  mobileLabel?: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}) {
  const { label, mobileLabel, active, dir, onClick, className = "" } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-max max-w-full cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-left font-semibold outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${active ? "bg-sky-50 text-sky-700" : "hover:bg-zinc-200/80"} ${className}`}
    >
      <span>
        {mobileLabel !== undefined ? (
          <>
            <span className="lg:hidden">{mobileLabel}</span>
            <span className="hidden lg:inline">{label}</span>
          </>
        ) : (
          label
        )}
      </span>
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
  /** Totals from [startWeek, endWeek − 1] for week-over-week Δ; null = not applicable (single-week window). */
  const [previousPeriodTotals, setPreviousPeriodTotals] = useState<Record<
    string,
    number
  > | null>(null);

  const rotoFetchGen = useRef(0);

  const [totalsSortCol, setTotalsSortCol] = useState<"team" | string>("team");
  const [totalsSortDir, setTotalsSortDir] = useState<SortDir>("asc");
  const [rotoSortCol, setRotoSortCol] = useState<
    "team" | "total" | "change" | string
  >("total");
  const [rotoSortDir, setRotoSortDir] = useState<SortDir>("desc");
  const [selectedRow, setSelectedRow] = useState<SelectedRow>(null);
  const [exportStatus, setExportStatus] = useState<{
    totals: string | null;
    roto: string | null;
  }>({
    totals: null,
    roto: null,
  });

  const totalsTableWrapRef = useRef<HTMLDivElement | null>(null);
  const rotoTableWrapRef = useRef<HTMLDivElement | null>(null);

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

    const fetchGen = ++rotoFetchGen.current;

    setRotoLoading(true);
    setRotoError(null);
    try {
      const buildUrl = (end: number) => {
        const url = new URL("/api/yahoo/league/roto", window.location.origin);
        url.searchParams.set("startWeek", String(apiStart));
        url.searchParams.set("endWeek", String(end));
        return url.toString();
      };

      const res = await fetch(buildUrl(apiEnd), { cache: "no-store" });
      const body = (await res.json()) as RotoOk | RotoErr;
      if (!res.ok || !body.ok) {
        throw new Error(
          !body.ok
            ? [body.error, body.details].filter(Boolean).join(": ")
            : `HTTP ${res.status}`,
        );
      }

      let previousTotalsMap: Record<string, number> | null = null;
      if (apiEnd > apiStart) {
        const prevRes = await fetch(buildUrl(apiEnd - 1), { cache: "no-store" });
        const prevBody = (await prevRes.json()) as RotoOk | RotoErr;
        if (prevRes.ok && prevBody.ok) {
          const map: Record<string, number> = {};
          for (const r of prevBody.tables.roto) {
            map[r.teamId] = r.totalScore;
          }
          previousTotalsMap = map;
        }
      }

      if (fetchGen !== rotoFetchGen.current) return;
      setRoto(body);
      setPreviousPeriodTotals(previousTotalsMap);
    } catch (e) {
      if (fetchGen === rotoFetchGen.current) {
        setRoto(null);
        setPreviousPeriodTotals(null);
        setRotoError(e instanceof Error ? e.message : "Failed to load roto.");
      }
    } finally {
      /* Only the latest in-flight request may clear loading (avoids races with the prior-week fetch). */
      if (fetchGen === rotoFetchGen.current) {
        setRotoLoading(false);
      }
    }
  }, [bounds, startWeek, resolvedEndWeek]);

  useEffect(() => {
    void loadRoto();
  }, [loadRoto]);

  useEffect(() => {
    function onDocumentPointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;

      const insideTotals = totalsTableWrapRef.current?.contains(target) ?? false;
      const insideRoto = rotoTableWrapRef.current?.contains(target) ?? false;

      if (!insideTotals && !insideRoto) {
        setSelectedRow(null);
      }
    }

    document.addEventListener("mousedown", onDocumentPointerDown);
    return () => {
      document.removeEventListener("mousedown", onDocumentPointerDown);
    };
  }, []);

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
      if (rotoSortCol === "team") {
        const cmp = a.teamName.localeCompare(b.teamName, undefined, {
          sensitivity: "base",
        });
        return rotoSortDir === "asc" ? cmp : -cmp;
      }
      if (rotoSortCol === "total") {
        return compareNullableNumbers(a.totalScore, b.totalScore, rotoSortDir);
      }
      if (rotoSortCol === "change") {
        const da = weeklyTotalDelta(a, previousPeriodTotals);
        const db = weeklyTotalDelta(b, previousPeriodTotals);
        return compareNullableNumbers(da, db, rotoSortDir);
      }
      const va = a.statScores[rotoSortCol] ?? null;
      const vb = b.statScores[rotoSortCol] ?? null;
      return compareNullableNumbers(va, vb, rotoSortDir);
    });
    return rows;
  }, [roto, rotoSortCol, rotoSortDir, previousPeriodTotals]);

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
    (colKey: "team" | "total" | "change" | string) => {
      if (colKey === rotoSortCol) {
        setRotoSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return;
      }
      setRotoSortCol(colKey);
      if (colKey === "team") {
        setRotoSortDir(defaultRotoSortDir("team"));
        return;
      }
      if (colKey === "total") {
        setRotoSortDir(defaultRotoSortDir("total"));
        return;
      }
      if (colKey === "change") {
        setRotoSortDir(defaultRotoSortDir("change"));
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

  const categories = roto?.categories ?? [];

  const totalsSortedByLabel =
    totalsSortCol === "team"
      ? "Team"
      : (categories.find((c) => c.id === totalsSortCol)?.label ?? totalsSortCol);

  const rotoSortedByLabel =
    rotoSortCol === "team"
      ? "Team"
      : rotoSortCol === "total"
        ? "Total"
        : rotoSortCol === "change"
          ? "Change"
          : (categories.find((c) => c.id === rotoSortCol)?.label ?? rotoSortCol);

  const endWeekDisplayLabel =
    endChoice === "current" ? "Current" : String(roto?.filters.endWeek ?? "");

  const totalsExportHeaders = useMemo(
    () => ["Rank", "Team", ...categories.map((c) => c.label)],
    [categories],
  );
  const totalsExportRows = useMemo(
    () =>
      sortedTotalsRows.map((row, rowIndex) => [
        rowIndex + 1,
        row.teamName,
        ...categories.map((c) => formatStat(c.id, row.stats[c.id] ?? null)),
      ]),
    [categories, sortedTotalsRows],
  );

  const rotoExportHeaders = useMemo(
    () => ["Rank", "Team", "Total", ...categories.map((c) => c.label), "Change"],
    [categories],
  );
  const rotoExportRows = useMemo(
    () =>
      sortedRotoRows.map((row, rowIndex) => [
        rowIndex + 1,
        row.teamName,
        row.totalScore.toFixed(2),
        ...categories.map((c) => (row.statScores[c.id] ?? 0).toFixed(2)),
        formatTotalChange(weeklyTotalDelta(row, previousPeriodTotals)),
      ]),
    [categories, previousPeriodTotals, sortedRotoRows],
  );

  return (
    <div className="flex w-full flex-col lg:gap-10 gap-6 text-[13px] lg:text-sm">
      <div className="flex flex-wrap items-end lg:gap-6 gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-900">
          Start week
          <select
            className="min-w-[6rem] lg:min-w-[10rem] rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-[13px] text-zinc-900 shadow-sm outline-none ring-zinc-400 focus:ring-2 lg:px-3 lg:py-2 lg:text-base"
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
            className="min-w-[6rem] lg:min-w-[10rem] rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-[13px] text-zinc-900 shadow-sm outline-none ring-zinc-400 focus:ring-2 lg:px-3 lg:py-2 lg:text-base"
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
              Frankings
            </h2>
            <div
              ref={rotoTableWrapRef}
              className="-mx-1 overflow-x-auto rounded-lg border border-zinc-200"
            >
              <table className="min-w-max w-full border-collapse text-left text-[13px] [&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2 [&_th]:py-1.5 lg:text-sm lg:[&_td]:px-3 lg:[&_td]:py-2 lg:[&_th]:px-3 lg:[&_th]:py-2">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="sticky left-0 z-20 w-[2.25rem] min-w-[2.25rem] max-w-[2.25rem] whitespace-nowrap bg-zinc-50 px-1 py-2 text-center text-zinc-900 shadow-[6px_0_8px_-6px_rgba(0,0,0,0.12)] lg:w-[3.25rem] lg:min-w-[3.25rem] lg:max-w-[3.25rem]">
                      <span className="lg:hidden" aria-hidden>
                        &nbsp;
                      </span>
                      <span className="hidden lg:inline">Rank</span>
                    </th>
                    <th
                      className="sticky left-[2.25rem] z-10 whitespace-nowrap bg-zinc-50 px-3 py-2 text-zinc-900 shadow-[6px_0_8px_-6px_rgba(0,0,0,0.12)] lg:left-[3.25rem]"
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
                    <th
                      className="whitespace-nowrap px-3 py-2 text-zinc-900"
                      aria-sort={
                        rotoSortCol === "change"
                          ? rotoSortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <SortHeaderButton
                        label="Change"
                        active={rotoSortCol === "change"}
                        dir={rotoSortDir}
                        onClick={() => onRotoSortClick("change")}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRotoRows.map((row, rowIndex) => (
                    <tr
                      key={row.teamId}
                      className={`group cursor-pointer border-b border-zinc-100 transition-colors ${selectedRow?.table === "roto" && selectedRow.teamId === row.teamId ? "bg-sky-50/100" : "hover:bg-zinc-100/100"}`}
                      onClick={() => {
                        setSelectedRow({ table: "roto", teamId: row.teamId });
                      }}
                    >
                      <td
                        className={`sticky left-0 z-20 w-[2.25rem] min-w-[2.25rem] max-w-[2.25rem] whitespace-nowrap px-1 py-2 text-center tabular-nums text-zinc-700 shadow-[6px_0_8px_-6px_rgba(0,0,0,0.08)] lg:w-[3.25rem] lg:min-w-[3.25rem] lg:max-w-[3.25rem] ${selectedRow?.table === "roto" && selectedRow.teamId === row.teamId ? "bg-sky-50/100" : "bg-white group-hover:bg-zinc-100/100"}`}
                      >
                        {rowIndex + 1}
                      </td>
                      <td
                        className={`sticky left-[2.25rem] z-10 whitespace-nowrap px-3 py-2 shadow-[6px_0_8px_-6px_rgba(0,0,0,0.08)] lg:left-[3.25rem] ${rotoSortCol === "team" ? "bg-sky-50/100 text-sky-800" : selectedRow?.table === "roto" && selectedRow.teamId === row.teamId ? "bg-sky-50/100 text-zinc-700" : "bg-white text-zinc-700 group-hover:bg-zinc-100/100"}`}
                      >
                        {row.teamName}
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-2 tabular-nums font-medium ${rotoSortCol === "total" ? "bg-sky-50/100 text-sky-800" : "text-zinc-900"}`}
                      >
                        {row.totalScore.toFixed(2)}
                      </td>
                      {roto.categories.map((c) => (
                        <td
                          key={c.id}
                          className={`whitespace-nowrap px-3 py-2 tabular-nums ${rotoSortCol === c.id ? "bg-sky-50/100 text-sky-800" : "text-zinc-700"}`}
                        >
                          {(row.statScores[c.id] ?? 0).toFixed(2)}
                        </td>
                      ))}
                      <td
                        className={`whitespace-nowrap px-3 py-2 tabular-nums ${rotoSortCol === "change"
                          ? "bg-sky-50/100 text-sky-800"
                          :
                          (() => {
                            const delta = weeklyTotalDelta(row, previousPeriodTotals);
                            if (delta === null || Number.isNaN(delta)) {
                              return "text-zinc-700";
                            }
                            if (delta > 0) {
                              return "bg-emerald-50 text-emerald-800";
                            }
                            if (delta < 0) {
                              return "bg-rose-50 text-rose-800";
                            }
                            return "text-zinc-700";
                          })()
                          }`}
                      >
                        {formatTotalChange(
                          weeklyTotalDelta(row, previousPeriodTotals),
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap justify-between">
              <p className="text-sm text-zinc-500">
                Sorted by: {rotoSortedByLabel} ({rotoSortDir})
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        toTsv(rotoExportHeaders, rotoExportRows),
                      );
                      setExportStatus((prev) => ({ ...prev, roto: "Copied TSV." }));
                    } catch {
                      setExportStatus((prev) => ({ ...prev, roto: "Clipboard failed." }));
                    }
                  }}
                  className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Copy Table
                </button>
                <button
                  type="button"
                  onClick={() => {
                    downloadTextFile(
                      "frankings.csv",
                      "text/csv;charset=utf-8",
                      toCsv(rotoExportHeaders, rotoExportRows),
                    );
                    setExportStatus((prev) => ({ ...prev, roto: "Saved CSV." }));
                  }}
                  className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Save as CSV
                </button>
                {exportStatus.roto ? (
                  <span className="text-xs text-zinc-500">{exportStatus.roto}</span>
                ) : null}
              </div>
            </div>
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-zinc-900">
              Category totals
            </h2>
            <p className="text-sm text-zinc-500">
              Week {roto.filters.startWeek} to {endWeekDisplayLabel}
            </p>
            <div
              ref={totalsTableWrapRef}
              className="-mx-1 overflow-x-auto rounded-lg border border-zinc-200"
            >
              <table className="min-w-max w-full border-collapse text-left text-[13px] [&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2 [&_th]:py-1.5 lg:text-sm lg:[&_td]:px-3 lg:[&_td]:py-2 lg:[&_th]:px-3 lg:[&_th]:py-2">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="sticky left-0 z-20 w-[2.25rem] min-w-[2.25rem] max-w-[2.25rem] whitespace-nowrap bg-zinc-50 px-1 py-2 text-center text-zinc-900 shadow-[6px_0_8px_-6px_rgba(0,0,0,0.12)] lg:w-[3.25rem] lg:min-w-[3.25rem] lg:max-w-[3.25rem]">
                      <span className="lg:hidden" aria-hidden>
                        &nbsp;
                      </span>
                      <span className="hidden lg:inline">Rank</span>
                    </th>
                    <th
                      className="sticky left-[2.25rem] z-10 whitespace-nowrap bg-zinc-50 px-3 py-2 text-zinc-900 shadow-[6px_0_8px_-6px_rgba(0,0,0,0.12)] lg:left-[3.25rem]"
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
                  </tr>
                </thead>
                <tbody>
                  {sortedTotalsRows.map((row, rowIndex) => (
                    <tr
                      key={row.teamId}
                      className={`group cursor-pointer border-b border-zinc-100 transition-colors ${selectedRow?.table === "totals" && selectedRow.teamId === row.teamId ? "bg-sky-50/100" : "hover:bg-zinc-100/100"}`}
                      onClick={() => {
                        setSelectedRow({ table: "totals", teamId: row.teamId });
                      }}
                    >
                      <td
                        className={`sticky left-0 z-20 w-[2.25rem] min-w-[2.25rem] max-w-[2.25rem] whitespace-nowrap px-1 py-2 text-center tabular-nums text-zinc-700 shadow-[6px_0_8px_-6px_rgba(0,0,0,0.08)] lg:w-[3.25rem] lg:min-w-[3.25rem] lg:max-w-[3.25rem] ${selectedRow?.table === "totals" && selectedRow.teamId === row.teamId ? "bg-sky-50/100" : "bg-white group-hover:bg-zinc-100/100"}`}
                      >
                        {rowIndex + 1}
                      </td>
                      <td
                        className={`sticky left-[2.25rem] z-10 whitespace-nowrap px-3 py-2 shadow-[6px_0_8px_-6px_rgba(0,0,0,0.08)] lg:left-[3.25rem] ${totalsSortCol === "team" ? "bg-sky-50/100 text-sky-800" : selectedRow?.table === "totals" && selectedRow.teamId === row.teamId ? "bg-sky-50/100 text-zinc-700" : "bg-white text-zinc-700 group-hover:bg-zinc-100/100"}`}
                      >
                        {row.teamName}
                      </td>
                      {roto.categories.map((c) => (
                        <td
                          key={c.id}
                          className={`whitespace-nowrap px-3 py-2 tabular-nums ${totalsSortCol === c.id ? "bg-sky-50/100 text-sky-800" : "text-zinc-700"}`}
                        >
                          {formatStat(c.id, row.stats[c.id] ?? null)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap justify-between">
              <p className="text-sm text-zinc-500">
                Sorted by: {totalsSortedByLabel} ({totalsSortDir})
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        toTsv(totalsExportHeaders, totalsExportRows),
                      );
                      setExportStatus((prev) => ({ ...prev, totals: "Copied TSV." }));
                    } catch {
                      setExportStatus((prev) => ({ ...prev, totals: "Clipboard failed." }));
                    }
                  }}
                  className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Copy Table
                </button>
                <button
                  type="button"
                  onClick={() => {
                    downloadTextFile(
                      "category-totals.csv",
                      "text/csv;charset=utf-8",
                      toCsv(totalsExportHeaders, totalsExportRows),
                    );
                    setExportStatus((prev) => ({ ...prev, totals: "Saved CSV." }));
                  }}
                  className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Save as CSV
                </button>
                {exportStatus.totals ? (
                  <span className="text-xs text-zinc-500">{exportStatus.totals}</span>
                ) : null}
              </div>
            </div>

          </section>
        </>
      ) : null}
    </div>
  );
}
