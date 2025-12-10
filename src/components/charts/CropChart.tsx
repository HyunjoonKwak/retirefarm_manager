"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";

interface CropProfitData {
  crop: string;
  income: string;
}

interface CropBarChartProps {
  data: CropProfitData[];
  height?: number;
}

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

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

export function CropProfitBarChart({ data, height = 300 }: CropBarChartProps) {
  const chartData = data.map((d, index) => ({
    name: d.crop,
    수입: Number(d.income),
    color: COLORS[index % COLORS.length],
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis type="number" tickFormatter={formatYAxis} tick={{ fill: "hsl(var(--muted-foreground))" }} />
        <YAxis type="category" dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))" }} width={80} />
        <Tooltip
          formatter={(value: number) => formatTooltip(value)}
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
          }}
        />
        <Bar dataKey="수입" radius={[0, 4, 4, 0]}>
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

interface CropAnalysisData {
  id: string;
  name: string;
  income: string;
  expense: string;
  profit: string;
  profitMargin: number;
  roi: number;
  cultivationDays: number;
}

interface CropComparisonChartProps {
  data: CropAnalysisData[];
  height?: number;
}

export function CropComparisonRadarChart({ data, height = 350 }: CropComparisonChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[350px] text-muted-foreground">
        데이터가 없습니다.
      </div>
    );
  }

  // 최대값 기준 정규화
  const maxIncome = Math.max(...data.map((d) => Number(d.income)));
  const maxExpense = Math.max(...data.map((d) => Number(d.expense)));
  const maxDays = Math.max(...data.map((d) => d.cultivationDays));
  const maxROI = Math.max(...data.map((d) => Math.max(0, d.roi)));

  const chartData = [
    {
      subject: "수입",
      ...Object.fromEntries(
        data.slice(0, 5).map((d) => [d.name, maxIncome > 0 ? (Number(d.income) / maxIncome) * 100 : 0])
      ),
      fullMark: 100,
    },
    {
      subject: "비용효율",
      ...Object.fromEntries(
        data.slice(0, 5).map((d) => [d.name, maxExpense > 0 ? (1 - Number(d.expense) / maxExpense) * 100 : 100])
      ),
      fullMark: 100,
    },
    {
      subject: "수익률",
      ...Object.fromEntries(
        data.slice(0, 5).map((d) => [d.name, Math.min(100, Math.max(0, d.profitMargin))])
      ),
      fullMark: 100,
    },
    {
      subject: "ROI",
      ...Object.fromEntries(
        data.slice(0, 5).map((d) => [d.name, maxROI > 0 ? (Math.max(0, d.roi) / maxROI) * 100 : 0])
      ),
      fullMark: 100,
    },
    {
      subject: "효율성",
      ...Object.fromEntries(
        data.slice(0, 5).map((d) => [d.name, maxDays > 0 ? (1 - d.cultivationDays / maxDays) * 100 + 20 : 50])
      ),
      fullMark: 100,
    },
  ];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
        <PolarGrid className="stroke-muted" />
        <PolarAngleAxis dataKey="subject" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} />
        {data.slice(0, 5).map((crop, index) => (
          <Radar
            key={crop.id}
            name={crop.name}
            dataKey={crop.name}
            stroke={COLORS[index % COLORS.length]}
            fill={COLORS[index % COLORS.length]}
            fillOpacity={0.2}
          />
        ))}
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
          }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

interface CropROIData {
  name: string;
  roi: number;
  profitMargin: number;
}

interface CropROIChartProps {
  data: CropROIData[];
  height?: number;
}

export function CropROIChart({ data, height = 300 }: CropROIChartProps) {
  const chartData = data.map((d, index) => ({
    name: d.name,
    ROI: d.roi,
    수익률: d.profitMargin,
    color: d.roi >= 0 ? COLORS[index % COLORS.length] : "#ef4444",
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
        <YAxis tickFormatter={(v) => `${v}%`} tick={{ fill: "hsl(var(--muted-foreground))" }} />
        <Tooltip
          formatter={(value: number) => `${value.toFixed(1)}%`}
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
          }}
        />
        <Bar dataKey="ROI" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="수익률" fill="#22c55e" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
