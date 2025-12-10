"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

interface CategoryDataPoint {
  category: string;
  amount: string;
  percentage?: number;
}

interface CategoryPieChartProps {
  data: CategoryDataPoint[];
  height?: number;
  title?: string;
  colors?: string[];
}

const DEFAULT_COLORS = [
  "#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

function formatTooltip(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value) + "원";
}

export function CategoryPieChart({ data, height = 300, colors = DEFAULT_COLORS }: CategoryPieChartProps) {
  const chartData = data.map((d) => ({
    name: d.category,
    value: Number(d.amount),
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
        데이터가 없습니다.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          outerRadius={100}
          innerRadius={50}
          fill="#8884d8"
          dataKey="value"
          paddingAngle={2}
        >
          {chartData.map((_, index) => (
            <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => formatTooltip(value)}
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
          }}
        />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          formatter={(value) => <span className="text-sm">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function SimplePieChart({ data, height = 250, colors = DEFAULT_COLORS }: CategoryPieChartProps) {
  const chartData = data.map((d) => ({
    name: d.category,
    value: Number(d.amount),
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[250px] text-muted-foreground">
        데이터가 없습니다.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          outerRadius={80}
          fill="#8884d8"
          dataKey="value"
        >
          {chartData.map((_, index) => (
            <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => formatTooltip(value)}
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
          }}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

const INCOME_COLORS = ["#22c55e", "#16a34a", "#15803d", "#166534", "#14532d"];
const EXPENSE_COLORS = ["#ef4444", "#dc2626", "#b91c1c", "#991b1b", "#7f1d1d"];

export function IncomePieChart(props: Omit<CategoryPieChartProps, "colors">) {
  return <CategoryPieChart {...props} colors={INCOME_COLORS} />;
}

export function ExpensePieChart(props: Omit<CategoryPieChartProps, "colors">) {
  return <CategoryPieChart {...props} colors={EXPENSE_COLORS} />;
}
