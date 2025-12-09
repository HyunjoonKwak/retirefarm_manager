"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calculator, Loader2, TrendingDown, TrendingUp, Percent, Wallet } from "lucide-react";
import { formatLargeNumber, formatPercent } from "@/lib/utils/format";
import { toast } from "sonner";

interface TaxCalculatorResult {
  purchasePrice: number;
  salePrice: number;
  acquisitionExpenses: number;
  transferExpenses: number;
  capitalGain: number;
  longTermDeduction: number;
  longTermDeductionRate: number;
  basicDeduction: number;
  taxableIncome: number;
  taxRate: number;
  capitalGainsTax: number;
  localIncomeTax: number;
  totalTax: number;
  effectiveTaxRate: number;
  netProceeds: number;
}

const PROPERTY_TYPE_OPTIONS = [
  { value: "HOUSE", label: "주택" },
  { value: "OFFICETEL_RESIDENTIAL", label: "주거용 오피스텔" },
  { value: "COMMERCIAL", label: "상가" },
  { value: "LAND", label: "토지" },
];

export function TaxCalculator() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TaxCalculatorResult | null>(null);

  // 입력값
  const [purchasePrice, setPurchasePrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [acquisitionExpenses, setAcquisitionExpenses] = useState("");
  const [holdingPeriodYears, setHoldingPeriodYears] = useState("");
  const [propertyType, setPropertyType] = useState("HOUSE");
  const [isOnlyHouse, setIsOnlyHouse] = useState(false);
  const [hasResided, setHasResided] = useState(false);
  const [ownershipShare, setOwnershipShare] = useState("100");
  const [includeEstimatedBrokerageFee, setIncludeEstimatedBrokerageFee] = useState(true);

  const isHouseType = propertyType === "HOUSE" || propertyType === "OFFICETEL_RESIDENTIAL";

  async function handleCalculate() {
    if (!purchasePrice || !salePrice) {
      toast.error("취득가와 매도가를 입력해주세요.");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/assets/tax-calculator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchasePrice: Number(purchasePrice),
          salePrice: Number(salePrice),
          acquisitionExpenses: Number(acquisitionExpenses) || 0,
          holdingPeriodYears: Number(holdingPeriodYears) || 0,
          propertyType,
          isOnlyHouse: isHouseType && isOnlyHouse,
          hasResided: isHouseType && hasResided,
          ownershipShare: Number(ownershipShare) || 100,
          includeEstimatedBrokerageFee,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || "계산 중 오류가 발생했습니다.");
        return;
      }

      setResult(data.result);
    } catch {
      toast.error("계산 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setPurchasePrice("");
    setSalePrice("");
    setAcquisitionExpenses("");
    setHoldingPeriodYears("");
    setPropertyType("HOUSE");
    setIsOnlyHouse(false);
    setHasResided(false);
    setOwnershipShare("100");
    setIncludeEstimatedBrokerageFee(true);
    setResult(null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* 입력 폼 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            양도소득세 계산기
          </CardTitle>
          <CardDescription>
            부동산 매도 시 예상 세금을 계산합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="purchasePrice">취득가 (원)</Label>
              <Input
                id="purchasePrice"
                type="number"
                placeholder="500000000"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="salePrice">매도가 (원)</Label>
              <Input
                id="salePrice"
                type="number"
                placeholder="700000000"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="acquisitionExpenses">취득비용 (원)</Label>
              <Input
                id="acquisitionExpenses"
                type="number"
                placeholder="취득세, 중개수수료 등"
                value={acquisitionExpenses}
                onChange={(e) => setAcquisitionExpenses(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="holdingPeriodYears">보유기간 (년)</Label>
              <Input
                id="holdingPeriodYears"
                type="number"
                placeholder="5"
                value={holdingPeriodYears}
                onChange={(e) => setHoldingPeriodYears(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="propertyType">부동산 유형</Label>
              <Select value={propertyType} onValueChange={setPropertyType}>
                <SelectTrigger id="propertyType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROPERTY_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ownershipShare">지분율 (%)</Label>
              <Input
                id="ownershipShare"
                type="number"
                placeholder="100"
                value={ownershipShare}
                onChange={(e) => setOwnershipShare(e.target.value)}
              />
            </div>
          </div>

          {isHouseType && (
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium">1세대 1주택 비과세 조건</p>
              <div className="flex items-center justify-between">
                <Label htmlFor="isOnlyHouse" className="font-normal">
                  1세대 1주택 여부
                </Label>
                <Switch
                  id="isOnlyHouse"
                  checked={isOnlyHouse}
                  onCheckedChange={setIsOnlyHouse}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="hasResided" className="font-normal">
                  2년 이상 거주 여부
                </Label>
                <Switch
                  id="hasResided"
                  checked={hasResided}
                  onCheckedChange={setHasResided}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label htmlFor="includeEstimatedBrokerageFee" className="font-normal">
              예상 중개수수료 자동 계산
            </Label>
            <Switch
              id="includeEstimatedBrokerageFee"
              checked={includeEstimatedBrokerageFee}
              onCheckedChange={setIncludeEstimatedBrokerageFee}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleCalculate} disabled={loading} className="flex-1">
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Calculator className="mr-2 h-4 w-4" />
              )}
              계산하기
            </Button>
            <Button variant="outline" onClick={handleReset}>
              초기화
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 결과 표시 */}
      <div className="space-y-4">
        {result ? (
          <>
            {/* 요약 카드들 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    양도차익
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {formatLargeNumber(result.capitalGain)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-red-500" />
                    총 납부세액
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">
                    {formatLargeNumber(result.totalTax)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-blue-500" />
                    세후 순수익
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">
                    {formatLargeNumber(result.netProceeds)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Percent className="h-4 w-4 text-orange-500" />
                    실효세율
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">
                    {formatPercent(result.effectiveTaxRate, 2)}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 상세 내역 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">세금 계산 상세</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">매도가</span>
                    <span>{formatLargeNumber(result.salePrice)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">취득가</span>
                    <span>{formatLargeNumber(result.purchasePrice)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">취득비용</span>
                    <span>{formatLargeNumber(result.acquisitionExpenses)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">양도비용</span>
                    <span>{formatLargeNumber(result.transferExpenses)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b font-medium">
                    <span>양도차익</span>
                    <span className="text-green-600">{formatLargeNumber(result.capitalGain)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">
                      장기보유특별공제 ({result.longTermDeductionRate}%)
                    </span>
                    <span className="text-blue-600">-{formatLargeNumber(result.longTermDeduction)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">기본공제</span>
                    <span className="text-blue-600">-{formatLargeNumber(result.basicDeduction)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b font-medium">
                    <span>과세표준</span>
                    <span>{formatLargeNumber(result.taxableIncome)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">적용세율</span>
                    <span>{result.taxRate}%</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">양도소득세</span>
                    <span className="text-red-600">{formatLargeNumber(result.capitalGainsTax)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b">
                    <span className="text-muted-foreground">지방소득세 (10%)</span>
                    <span className="text-red-600">{formatLargeNumber(result.localIncomeTax)}</span>
                  </div>
                  <div className="flex justify-between py-2 font-bold text-base">
                    <span>총 납부세액</span>
                    <span className="text-red-600">{formatLargeNumber(result.totalTax)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card className="h-full min-h-[400px] flex items-center justify-center">
            <CardContent className="flex flex-col items-center text-center">
              <Calculator className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                취득가와 매도가를 입력하고<br />
                계산하기 버튼을 클릭하세요.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
