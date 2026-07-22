#!/bin/sh
set -e

echo "Starting RetireFarm Manager..."

# 데이터 디렉토리 확인
if [ ! -d "/app/prisma/data" ]; then
    echo "Creating data directory..."
    mkdir -p /app/prisma/data
fi

# DB 파일이 없으면 빈 파일 생성 (권한 확보)
if [ ! -f "/app/prisma/data/retirefarm.db" ]; then
    echo "Initializing database file..."
    touch /app/prisma/data/retirefarm.db
fi

# Prisma 마이그레이션 실행 (DB 스키마 생성)
echo "Running Prisma migrations..."
npx prisma migrate deploy

# 스케줄러는 src/instrumentation.ts에서 서버 부팅 시 자동 초기화됨
echo "Starting Next.js server..."
exec node server.js
