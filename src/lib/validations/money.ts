import { z } from "zod";

export const KRW_INTEGER_MESSAGE = "금액은 원 단위 정수로 입력해주세요.";

/**
 * 원 단위 정수 금액 스키마. 집계가 정수를 전제로 하지는 않지만(Decimal 집계),
 * 신규 입력은 정수만 허용해 데이터가 더 흐트러지지 않게 한다.
 */
export function krwAmountSchema(options: { min?: number; minMessage?: string } = {}) {
  const { min = 0, minMessage } = options;
  return z
    .number()
    .int(KRW_INTEGER_MESSAGE)
    .min(min, minMessage ?? `금액은 ${min.toLocaleString()}원 이상이어야 합니다.`);
}
