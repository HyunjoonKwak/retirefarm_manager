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

echo "Starting Next.js server..."

# 서버를 백그라운드에서 시작하고 스케줄러 초기화 후 포그라운드로 전환
node server.js &
SERVER_PID=$!

# 서버가 준비될 때까지 대기 (최대 30초)
echo "Waiting for server to be ready..."
MAX_WAIT=30
WAIT_COUNT=0
while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    if wget -q --spider http://localhost:3000/api/health 2>/dev/null || wget -q --spider http://localhost:3000 2>/dev/null; then
        echo "Server is ready!"
        break
    fi
    sleep 1
    WAIT_COUNT=$((WAIT_COUNT + 1))
done

# 스케줄러 초기화 호출
echo "Initializing scheduler..."
SCHEDULER_RESPONSE=$(wget -q -O - "http://localhost:3000/api/market/garak/scheduler?action=init" 2>/dev/null || echo '{"error":"failed"}')
echo "Scheduler response: $SCHEDULER_RESPONSE"

# 서버 프로세스를 포그라운드로 전환 (서버가 종료되면 컨테이너도 종료)
wait $SERVER_PID
