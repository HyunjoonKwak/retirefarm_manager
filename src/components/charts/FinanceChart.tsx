"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  AreaChart,
  ComposedChart,
} from "recharts";

interface MonthlyDataPoint {
  month: number;
  income: string;
  expense: string;
  profit: string;
}

interface DailyDataPoint {
  day: number;
  income: string;
  expense: string;
}

interface FinanceBarChartProps {
  data: MonthlyDataPoint[];
  height?: number;
}

interface DailyAreaChartProps {
  data: DailyDataPoint[];
  height?: number;
}

const MONTHS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

function formatYAxis(value: number): string {
  if (value >= 100000000) {
    return `${(value / 100000000).toFixed(0)}억`;
  }
  if (value >= 10000) {
    return `${(value / 10000).toFixed(0)}만`;
  }
  return value.toString();
}

function formatTooltip(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value) + "원";
}

export function MonthlyFinanceBarChart({ data, height = 300 }: FinanceBarChartProps) {
  const chartData = data.map((d) => ({
    name: MONTHS[d.month - 1],
    수입: Number(d.income),
    지출: Number(d.expense),
    순이익: Number(d.profit),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="name" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
        <YAxis tickFormatter={formatYAxis} className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
        <Tooltip
          formatter={(value: number) => formatTooltip(value)}
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
          }}
        />
        <Legend />
        <Bar dataKey="수입" fill="#22c55e" radius={[4, 4, 0, 0]} />
        <Bar dataKey="지출" fill="#ef4444" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MonthlyProfitLineChart({ data, height = 300 }: FinanceBarChartProps) {
  const chartData = data.map((d) => ({
    name: MONTHS[d.month - 1],
    순이익: Number(d.profit),
    수입: Number(d.income),
    지출: Number(d.expense),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="name" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
        <YAxis tickFormatter={formatYAxis} className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
        <Tooltip
          formatter={(value: number) => formatTooltip(value)}
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
          }}
        />
        <Legend />
        <Area type="monotone" dataKey="수입" fill="#22c55e20" stroke="#22c55e" />
        <Area type="monotone" dataKey="지출" fill="#ef444420" stroke="#ef4444" />
        <Line type="monotone" dataKey="순이익" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function DailyFinanceAreaChart({ data, height = 200 }: DailyAreaChartProps) {
  const chartData = data.map((d) => ({
    name: `${d.day}일`,
    수입: Number(d.income),
    지출: Number(d.expense),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="name"
          className="text-xs"
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
          interval={4}
        />
        <YAxis tickFormatter={formatYAxis} className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
        <Tooltip
          formatter={(value: number) => formatTooltip(value)}
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
          }}
        />
        <Area type="monotone" dataKey="수입" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.6} />
        <Area type="monotone" dataKey="지출" stackId="2" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface QuarterlyDataPoint {
  quarter: number;
  income: string;
  expense: string;
  profit: string;
}

interface QuarterlyChartProps {
  data: QuarterlyDataPoint[];
  height?: number;
}

export function QuarterlyFinanceChart({ data, height = 250 }: QuarterlyChartProps) {
  const chartData = data.map((d) => ({
    name: `${d.quarter}Q`,
    수입: Number(d.income),
    지출: Number(d.expense),
    순이익: Number(d.profit),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="name" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
        <YAxis tickFormatter={formatYAxis} className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
        <Tooltip
          formatter={(value: number) => formatTooltip(value)}
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
          }}
        />
        <Legend />
        <Bar dataKey="수입" fill="#22c55e" radius={[4, 4, 0, 0]} />
        <Bar dataKey="지출" fill="#ef4444" radius={[4, 4, 0, 0]} />
        <Bar dataKey="순이익" fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
