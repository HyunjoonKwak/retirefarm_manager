#!/bin/bash

# SQLite 데이터베이스 자동 백업 크론 스크립트
# 사용법: crontab에 등록하여 주기적으로 실행
# 예: 0 2 * * 0 /path/to/backup-cron.sh (매주 일요일 새벽 2시)

# 설정
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$PROJECT_DIR/data/backup-schedule.json"
BACKUP_DIR="$PROJECT_DIR/backups"
LOG_FILE="$PROJECT_DIR/data/backup.log"

# Docker 컨테이너 이름
CONTAINER_NAME="retirefarm-app"
DB_FILE="retirefarm.db"
SQLITE_PATH="/app/prisma/data/$DB_FILE"

# 로그 함수
log() {
    mkdir -p "$(dirname "$LOG_FILE")"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

# 스케줄 확인
check_schedule() {
    if [ ! -f "$CONFIG_FILE" ]; then
        log "설정 파일 없음 - 기본값 사용 (일요일 새벽 2시)"
        return 0
    fi

    # jq로 enabled 값 확인
    if command -v jq &> /dev/null; then
        local enabled=$(jq -r '.enabled' "$CONFIG_FILE")
        if [ "$enabled" = "false" ]; then
            log "자동 백업 비활성화됨"
            exit 0
        fi
    fi

    return 0
}

# 백업 실행
run_backup() {
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local filename="backup_${timestamp}.db"
    local filepath="$BACKUP_DIR/$filename"

    # 백업 디렉토리 확인
    mkdir -p "$BACKUP_DIR"

    log "백업 시작: $filename"

    # 컨테이너에서 SQLite 파일 복사
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        docker cp "${CONTAINER_NAME}:${SQLITE_PATH}" "$filepath" 2>> "$LOG_FILE"
    else
        log "ERROR: 컨테이너가 실행 중이지 않습니다."
        exit 1
    fi

    if [ $? -eq 0 ] && [ -f "$filepath" ]; then
        # 압축
        gzip "$filepath"
        local size=$(du -h "${filepath}.gz" | cut -f1)
        log "백업 완료: ${filename}.gz ($size)"
    else
        log "ERROR: 백업 실패"
        rm -f "$filepath"
        exit 1
    fi
}

# 오래된 백업 정리
cleanup_old_backups() {
    local retention_days=30

    # 설정 파일에서 보관 기간 읽기
    if [ -f "$CONFIG_FILE" ] && command -v jq &> /dev/null; then
        local configured_days=$(jq -r '.retentionDays // 30' "$CONFIG_FILE")
        if [ "$configured_days" -gt 0 ]; then
            retention_days=$configured_days
        fi
    fi

    log "오래된 백업 정리 (보관: ${retention_days}일)"

    # 오래된 파일 삭제
    find "$BACKUP_DIR" -name "backup_*.db.gz" -type f -mtime +$retention_days -delete 2>> "$LOG_FILE"

    local count=$(find "$BACKUP_DIR" -name "backup_*.db.gz" -type f | wc -l)
    log "현재 백업 파일 수: $count"
}

# 메인 실행
main() {
    log "=== 자동 백업 시작 ==="

    check_schedule
    run_backup
    cleanup_old_backups

    log "=== 자동 백업 완료 ==="
}

main
