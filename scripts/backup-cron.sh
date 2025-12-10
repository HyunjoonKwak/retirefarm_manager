#!/bin/bash

# 데이터베이스 자동 백업 크론 스크립트
# 사용법: crontab에 등록하여 주기적으로 실행
# 예: 0 2 * * 0 /path/to/backup-cron.sh (매주 일요일 새벽 2시)

# 설정
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$PROJECT_DIR/data/backup-schedule.json"
BACKUP_DIR="$PROJECT_DIR/data/backups"
LOG_FILE="$PROJECT_DIR/data/backup.log"

# 환경변수 로드
if [ -f "$PROJECT_DIR/.env" ]; then
    export $(cat "$PROJECT_DIR/.env" | grep -v '^#' | xargs)
fi

if [ -f "$PROJECT_DIR/.env.local" ]; then
    export $(cat "$PROJECT_DIR/.env.local" | grep -v '^#' | xargs)
fi

# DATABASE_URL 파싱
parse_database_url() {
    local url="$DATABASE_URL"

    # postgresql://user:password@host:port/database 형식 파싱
    if [[ $url =~ postgresql://([^:]+):([^@]+)@([^:]+):([^/]+)/(.+) ]]; then
        DB_USER="${BASH_REMATCH[1]}"
        DB_PASSWORD="${BASH_REMATCH[2]}"
        DB_HOST="${BASH_REMATCH[3]}"
        DB_PORT="${BASH_REMATCH[4]}"
        DB_NAME="${BASH_REMATCH[5]}"
        # 쿼리 파라미터 제거
        DB_NAME="${DB_NAME%%\?*}"
    else
        echo "$(date '+%Y-%m-%d %H:%M:%S') - ERROR: DATABASE_URL 파싱 실패" >> "$LOG_FILE"
        exit 1
    fi
}

# 로그 함수
log() {
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
    local filename="backup_${timestamp}.sql"
    local filepath="$BACKUP_DIR/$filename"

    # 백업 디렉토리 확인
    mkdir -p "$BACKUP_DIR"

    log "백업 시작: $filename"

    # pg_dump 실행
    PGPASSWORD="$DB_PASSWORD" pg_dump \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        -F p \
        > "$filepath" 2>> "$LOG_FILE"

    if [ $? -eq 0 ]; then
        local size=$(du -h "$filepath" | cut -f1)
        log "백업 완료: $filename ($size)"
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
    find "$BACKUP_DIR" -name "backup_*.sql" -type f -mtime +$retention_days -delete 2>> "$LOG_FILE"

    local count=$(find "$BACKUP_DIR" -name "backup_*.sql" -type f | wc -l)
    log "현재 백업 파일 수: $count"
}

# 메인 실행
main() {
    log "=== 자동 백업 시작 ==="

    check_schedule
    parse_database_url
    run_backup
    cleanup_old_backups

    log "=== 자동 백업 완료 ==="
}

main
