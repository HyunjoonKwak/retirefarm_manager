#!/bin/bash

# RetireFarm Manager - 나스 배포 관리 스크립트
# 사용법: ./manage.sh [start|stop|restart|status|logs|build|update|backup]

set -e

# 설정
APP_NAME="retirefarm-manager"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
DOCKER_COMPOSE_FILE="$APP_DIR/docker-compose.yml"
BACKUP_DIR="$APP_DIR/backups"
LOG_FILE="$APP_DIR/logs/app.log"

# 색상
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 로그 함수
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Docker Compose 파일 존재 확인
check_docker_compose() {
    if [ ! -f "$DOCKER_COMPOSE_FILE" ]; then
        log_error "docker-compose.yml 파일이 없습니다. 먼저 생성해주세요."
        exit 1
    fi
}

# 환경 변수 파일 확인
check_env() {
    if [ ! -f "$APP_DIR/.env" ]; then
        log_warning ".env 파일이 없습니다. .env.example을 복사합니다."
        if [ -f "$APP_DIR/.env.example" ]; then
            cp "$APP_DIR/.env.example" "$APP_DIR/.env"
            log_info ".env 파일을 생성했습니다. 설정을 확인해주세요."
        else
            log_error ".env.example 파일도 없습니다. 환경 변수를 설정해주세요."
            exit 1
        fi
    fi
}

# 시작
start() {
    log_info "$APP_NAME 시작 중..."
    check_docker_compose
    check_env

    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d

    if [ $? -eq 0 ]; then
        log_success "$APP_NAME이(가) 시작되었습니다."
        status
    else
        log_error "시작에 실패했습니다."
        exit 1
    fi
}

# 중지
stop() {
    log_info "$APP_NAME 중지 중..."
    check_docker_compose

    docker-compose -f "$DOCKER_COMPOSE_FILE" down

    if [ $? -eq 0 ]; then
        log_success "$APP_NAME이(가) 중지되었습니다."
    else
        log_error "중지에 실패했습니다."
        exit 1
    fi
}

# 재시작
restart() {
    log_info "$APP_NAME 재시작 중..."
    stop
    sleep 2
    start
}

# 상태 확인
status() {
    log_info "$APP_NAME 상태:"
    echo ""
    docker-compose -f "$DOCKER_COMPOSE_FILE" ps 2>/dev/null || echo "컨테이너가 실행 중이지 않습니다."
    echo ""

    # 헬스체크
    if command -v curl &> /dev/null; then
        log_info "헬스체크 중..."
        HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3024 2>/dev/null || echo "000")
        if [ "$HTTP_STATUS" = "200" ]; then
            log_success "애플리케이션이 정상 응답합니다. (HTTP $HTTP_STATUS)"
            log_info "접속 URL: http://localhost:3024"
        else
            log_warning "애플리케이션 응답 없음 또는 오류 (HTTP $HTTP_STATUS)"
        fi
    fi
}

# 로그 보기
logs() {
    log_info "$APP_NAME 로그:"
    docker-compose -f "$DOCKER_COMPOSE_FILE" logs -f --tail=100
}

# 빌드
build() {
    log_info "$APP_NAME 빌드 중..."
    check_docker_compose
    check_env

    docker-compose -f "$DOCKER_COMPOSE_FILE" build --no-cache

    if [ $? -eq 0 ]; then
        log_success "빌드가 완료되었습니다."
    else
        log_error "빌드에 실패했습니다."
        exit 1
    fi
}

# 업데이트 (git pull + rebuild + restart)
update() {
    log_info "$APP_NAME 업데이트 중..."

    # Git 업데이트
    log_info "Git에서 최신 코드 가져오는 중..."
    git -C "$APP_DIR" pull origin main

    if [ $? -ne 0 ]; then
        log_error "Git pull에 실패했습니다."
        exit 1
    fi

    # 빌드 및 재시작
    build
    restart

    log_success "업데이트가 완료되었습니다."
}

# 데이터베이스 백업
backup() {
    log_info "데이터베이스 백업 중..."

    # 백업 디렉토리 생성
    mkdir -p "$BACKUP_DIR"

    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sql"

    # PostgreSQL 백업 (Docker 컨테이너 이름에 따라 수정 필요)
    docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T db pg_dump -U postgres retirefarm > "$BACKUP_FILE" 2>/dev/null

    if [ $? -eq 0 ] && [ -s "$BACKUP_FILE" ]; then
        # 압축
        gzip "$BACKUP_FILE"
        log_success "백업 완료: ${BACKUP_FILE}.gz"

        # 오래된 백업 삭제 (30일 이상)
        find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +30 -delete
        log_info "30일 이상 된 백업 파일을 삭제했습니다."
    else
        rm -f "$BACKUP_FILE"
        log_error "백업에 실패했습니다."
        exit 1
    fi
}

# 데이터베이스 복원
restore() {
    if [ -z "$2" ]; then
        log_error "복원할 백업 파일을 지정해주세요."
        echo "사용법: $0 restore <backup_file.sql.gz>"
        echo ""
        echo "사용 가능한 백업 파일:"
        ls -la "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "백업 파일이 없습니다."
        exit 1
    fi

    RESTORE_FILE="$2"

    if [ ! -f "$RESTORE_FILE" ]; then
        log_error "백업 파일을 찾을 수 없습니다: $RESTORE_FILE"
        exit 1
    fi

    log_warning "이 작업은 현재 데이터베이스를 덮어씁니다!"
    read -p "계속하시겠습니까? (y/N): " confirm

    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        log_info "복원이 취소되었습니다."
        exit 0
    fi

    log_info "데이터베이스 복원 중..."

    # 압축 해제 후 복원
    gunzip -c "$RESTORE_FILE" | docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T db psql -U postgres retirefarm

    if [ $? -eq 0 ]; then
        log_success "복원이 완료되었습니다."
    else
        log_error "복원에 실패했습니다."
        exit 1
    fi
}

# Prisma 마이그레이션
migrate() {
    log_info "Prisma 마이그레이션 실행 중..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" exec app npx prisma migrate deploy

    if [ $? -eq 0 ]; then
        log_success "마이그레이션이 완료되었습니다."
    else
        log_error "마이그레이션에 실패했습니다."
        exit 1
    fi
}

# 셸 접속
shell() {
    log_info "컨테이너 셸에 접속합니다..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" exec app /bin/sh
}

# 클린업 (미사용 이미지/볼륨 정리)
cleanup() {
    log_info "Docker 리소스 정리 중..."

    docker system prune -f
    docker volume prune -f

    log_success "정리가 완료되었습니다."
}

# 도움말
show_help() {
    echo ""
    echo "=========================================="
    echo "  RetireFarm Manager 관리 스크립트"
    echo "=========================================="
    echo ""
    echo "사용법: $0 [명령어]"
    echo ""
    echo "명령어:"
    echo "  start     - 애플리케이션 시작"
    echo "  stop      - 애플리케이션 중지"
    echo "  restart   - 애플리케이션 재시작"
    echo "  status    - 상태 확인"
    echo "  logs      - 로그 보기 (실시간)"
    echo "  build     - Docker 이미지 빌드"
    echo "  update    - Git pull + 빌드 + 재시작"
    echo "  backup    - 데이터베이스 백업"
    echo "  restore   - 데이터베이스 복원"
    echo "  migrate   - Prisma 마이그레이션 실행"
    echo "  shell     - 컨테이너 셸 접속"
    echo "  cleanup   - Docker 리소스 정리"
    echo "  help      - 이 도움말 표시"
    echo ""
    echo "예시:"
    echo "  $0 start           # 시작"
    echo "  $0 logs            # 로그 확인"
    echo "  $0 update          # 업데이트"
    echo "  $0 backup          # 백업"
    echo "  $0 restore backup_20241210_120000.sql.gz  # 복원"
    echo ""
}

# 메인
case "$1" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    status)
        status
        ;;
    logs)
        logs
        ;;
    build)
        build
        ;;
    update)
        update
        ;;
    backup)
        backup
        ;;
    restore)
        restore "$@"
        ;;
    migrate)
        migrate
        ;;
    shell)
        shell
        ;;
    cleanup)
        cleanup
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        log_error "알 수 없는 명령어: $1"
        show_help
        exit 1
        ;;
esac
