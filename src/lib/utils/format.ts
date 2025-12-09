/**
 * 숫자를 한국 원화 형식으로 포맷팅
 */
export function formatCurrency(value: number | string | undefined | null): string {
  if (value === undefined || value === null) return "0원";

  const num = typeof value === "string" ? Number(value) : value;
  if (isNaN(num)) return "0원";

  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * 큰 숫자를 억/만 단위로 표시
 */
export function formatLargeNumber(value: number | string | undefined | null): string {
  if (value === undefined || value === null) return "0원";

  const num = typeof value === "string" ? Number(value) : value;
  if (isNaN(num)) return "0원";

  const absNum = Math.abs(num);
  const sign = num < 0 ? "-" : "";

  if (absNum >= 100000000) {
    // 1억 이상
    const billions = absNum / 100000000;
    if (absNum % 100000000 === 0) {
      return `${sign}${billions.toFixed(0)}억원`;
    }
    return `${sign}${billions.toFixed(1)}억원`;
  }

  if (absNum >= 10000) {
    // 1만 이상
    const tenThousands = absNum / 10000;
    if (absNum % 10000 === 0) {
      return `${sign}${tenThousands.toFixed(0)}만원`;
    }
    return `${sign}${tenThousands.toFixed(0)}만원`;
  }

  return formatCurrency(num);
}

/**
 * 퍼센트 포맷팅
 */
export function formatPercent(value: number | undefined | null, decimals: number = 1): string {
  if (value === undefined || value === null) return "0%";
  return `${value.toFixed(decimals)}%`;
}

/**
 * 날짜 포맷팅 (YYYY.MM.DD)
 */
export function formatDate(date: Date | string | undefined | null): string {
  if (!date) return "-";

  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "-";

  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).replace(/\. /g, ".").replace(/\.$/, "");
}

/**
 * D-Day 계산
 */
export function calculateDDay(targetDate: Date | string): { text: string; days: number; isOverdue: boolean } {
  const target = typeof targetDate === "string" ? new Date(targetDate) : targetDate;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  const diff = target.getTime() - now.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return { text: "D-Day", days: 0, isOverdue: false };
  } else if (days > 0) {
    return { text: `D-${days}`, days, isOverdue: false };
  } else {
    return { text: `D+${Math.abs(days)}`, days, isOverdue: true };
  }
}
