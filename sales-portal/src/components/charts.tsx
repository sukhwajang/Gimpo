"use client";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtKrw } from "@/lib/format";

export type Series = { key: string; name: string; color: string; type?: "bar" | "line"; stack?: string };
type Datum = Record<string, string | number | null | undefined>;

const tick = { fontSize: 11, fill: "#64748b" };

/**
 * 클릭 가능한 막대/선 차트.
 * - 각 데이터 행의 `href`(또는 `href_<seriesKey>`)로 이동한다.
 * - colorKey 를 주면 행마다 다른 색을 쓴다(단일 시리즈용).
 */
export function ClickChart({
  data, xKey, series, layout = "horizontal", height = 260, colorKey, unit = "krw", yWidth = 110,
}: {
  data: Datum[]; xKey: string; series: Series[]; layout?: "horizontal" | "vertical"; height?: number; colorKey?: string; unit?: "krw" | "count" | "pct"; yWidth?: number;
}) {
  const router = useRouter();
  const fmt = (v: number) => (unit === "krw" ? fmtKrw(v) : unit === "pct" ? `${v.toFixed(0)}%` : v.toLocaleString());
  const go = (row: Datum | undefined, key: string) => {
    const href = (row?.[`href_${key}`] ?? row?.href) as string | undefined;
    if (href) router.push(href);
  };
  const vertical = layout === "vertical";
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} layout={layout} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={!vertical} vertical={vertical} />
        {vertical ? (
          <>
            <XAxis type="number" tick={tick} tickFormatter={fmt} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey={xKey} tick={tick} width={yWidth} axisLine={false} tickLine={false} interval={0} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tick={tick} axisLine={false} tickLine={false} interval={0} />
            <YAxis tick={tick} tickFormatter={fmt} axisLine={false} tickLine={false} width={56} />
          </>
        )}
        <Tooltip formatter={(v: number, name: string) => [fmt(Number(v)), name]} cursor={{ fill: "rgba(148,163,184,0.12)" }} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} iconSize={10} />}
        {series.map((s) =>
          s.type === "line" ? (
            <Line key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2 }} isAnimationActive={false} />
          ) : (
            <Bar
              key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId={s.stack} maxBarSize={vertical ? 18 : 36} radius={s.stack ? 0 : vertical ? [0, 3, 3, 0] : [3, 3, 0, 0]}
              cursor="pointer" isAnimationActive={false}
              onClick={(d: { payload?: Datum }) => go(d?.payload, s.key)}
            >
              {colorKey && s.key === series[0].key && data.map((row, i) => <Cell key={i} fill={(row[colorKey] as string) || s.color} />)}
            </Bar>
          )
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** 클릭 없는 단순 월별 막대(고객 상세 등) */
export function MiniBar({ data, color = "#1e3a8a", height = 160 }: { data: { label: string; value: number }[]; color?: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
        <YAxis tick={tick} tickFormatter={fmtKrw} axisLine={false} tickLine={false} width={50} />
        <Tooltip formatter={(v: number) => [fmtKrw(Number(v)), "매출(원화)"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
        <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
