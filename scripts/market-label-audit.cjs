#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node CommonJS audit CLI, also run over stdin in the production container. */
/* Read-only label audit. Suggestions never modify raw trades or merge price groups. */
const { PrismaClient } = require('@prisma/client');
const { createHash } = require('node:crypto');
const args = process.argv.slice(2);
const productIndex = args.indexOf('--product');
const product = productIndex >= 0 ? args[productIndex + 1]?.trim() : '';
if (!product || product.length > 50 || args.length !== 2) {
  process.stderr.write('Usage: node --env-file=.env scripts/market-label-audit.cjs --product <품목명>\n');
  process.exit(1);
}
const db = new PrismaClient();
const key = (value, field) => {
  const spelling = value.normalize('NFC').replace(/\s+/gu, '').toLocaleLowerCase('ko');
  // Product-token placement and parentheses are review hints, never approved aliases.
  return field === 'variety' ? spelling.replace(/[()（）]/gu, '').split(product.toLocaleLowerCase('ko')).join('') || spelling : spelling;
};
async function audit() {
  const records = await db.auctionResult.groupBy({
    by: ['variety', 'origin', 'grade', 'unit', 'corporation', 'corporationCode'], where: { productName: product },
    _count: { _all: true }, _sum: { quantity: true }, _min: { auctionDate: true }, _max: { auctionDate: true },
  });
  const dimensions = {};
  for (const field of ['variety', 'origin', 'grade', 'unit']) {
    const candidates = new Map();
    for (const row of records) {
      const raw = row[field]; const candidateKey = key(raw, field);
      const labels = candidates.get(candidateKey) ?? new Map();
      const entry = labels.get(raw) ?? { tradeCount: 0, corporations: new Set() };
      entry.tradeCount += row._count._all; entry.corporations.add(row.corporationCode);
      labels.set(raw, entry); candidates.set(candidateKey, labels);
    }
    dimensions[field] = [...candidates.entries()].map(([candidateKey, labels]) => ({
      candidateId: createHash('sha256').update(JSON.stringify([product, field, candidateKey])).digest('hex').slice(0, 20),
      candidateKey,
      requiresReview: labels.size > 1 || candidateKey === '',
      labels: [...labels.entries()].map(([raw, entry]) => ({ raw, tradeCount: entry.tradeCount, corporationCodes: [...entry.corporations].sort() })),
    })).sort((a, b) => Number(b.requiresReview) - Number(a.requiresReview) || a.candidateKey.localeCompare(b.candidateKey, 'ko'));
  }
  process.stdout.write(JSON.stringify({
    product, generatedAt: new Date().toISOString(), version: 1,
    policy: '후보는 공백·대소문자·유니코드 차이와 품종명의 괄호·품목명 위치 차이를 제안합니다. 표준코드가 아니며, 의미가 같은지는 사람이 검토해야 합니다. 원문과 가격 그룹은 변경하지 않습니다.',
    tradeCount: records.reduce((sum, row) => sum + row._count._all, 0), dimensions,
    comparisonGroups: records.map(row => ({ variety: row.variety, origin: row.origin, grade: row.grade, unit: row.unit, corporation: row.corporation, corporationCode: row.corporationCode, tradeCount: row._count._all, quantity: row._sum.quantity, firstSeenAt: row._min.auctionDate, lastSeenAt: row._max.auctionDate })),
  }, null, 2) + '\n');
}
audit().catch(() => { process.stderr.write('Label audit failed. Check database access and schema.\n'); process.exitCode = 1; }).finally(() => db.$disconnect());
