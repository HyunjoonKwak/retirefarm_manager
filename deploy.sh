#!/bin/bash

# RetireFarm Manager - NAS 배포 스크립트 (GHCR 이미지 기반)
# 사용법: ./deploy.sh [login|pull|deploy|update|start|stop|restart|status|logs|backup|clean]

set -e

# 설정
APP_NAME="retirefarm-manager"
GHCR_USERNAME="${GHCR_USERNAME:-hyunjoonkwak}"
IMAGE_NAME="ghcr.io/$GHCR_USERNAME/retirefarm-manager"
IMAGE_TAG="${IMAGE_TAG:-latest}"
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.prod.yml"
BACKUP_DIR="$DEPLOY_DIR/backups"
DB_FILE="retirefarm.db"

# 색상
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 환경 변수 파일 확인
check_env() {
    if [ ! -f "$DEPLOY_DIR/.env" ]; then
        log_warning ".env 파일이 없습니다."
        echo ""
        echo "필수 환경 변수 (.env 파일에 설정):"
        echo "  NEXTAUTH_SECRET=<랜덤 시크릿>"
        echo "  NEXTAUTH_URL=http://your-nas-ip:3024"
        echo "  KAMIS_API_KEY=<KAMIS API Key>"
        echo "  KAMIS_API_ID=<KAMIS API ID>"
        echo ""
        return 1
    fi
    source "$DEPLOY_DIR/.env"
}

# GHCR 로그인 (대화형)
ghcr_login() {
    log_info "GHCR 로그인"
    echo ""
    echo -e "${YELLOW}GitHub Personal Access Token이 필요합니다.${NC}"
    echo ""

    read -p "GitHub 사용자명 [$GHCR_USERNAME]: " input_username
    GHCR_USERNAME="${input_username:-$GHCR_USERNAME}"

    echo -e "${YELLOW}토큰을 입력하세요 (read:packages 권한 필요):${NC}"
    read -s token
    echo ""

    if [ -z "$token" ]; then
        log_error "토큰이 입력되지 않았습니다."
        exit 1
    fi

    echo "$token" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin

    if [ $? -eq 0 ]; then
        log_success "GHCR 로그인 성공"
    else
        log_error "GHCR 로그인 실패"
        exit 1
    fi
}

# 이미지 Pull
pull_image() {
    log_info "이미지 다운로드 중: $IMAGE_NAME:$IMAGE_TAG"

    docker pull "$IMAGE_NAME:$IMAGE_TAG"

    if [ $? -eq 0 ]; then
        log_success "이미지 다운로드 완료"
    else
        log_error "이미지 다운로드 실패. GHCR 로그인 상태를 확인하세요."
        exit 1
    fi
}

# 배포 (초기 설치)
deploy() {
    log_info "RetireFarm Manager 배포 중..."

    # 필수 디렉토리 생성
    mkdir -p "$BACKUP_DIR"

    # GHCR 로그인 (대화형)
    ghcr_login

    # 이미지 pull
    pull_image

    log_info "컨테이너 시작 중..."
    docker-compose -f "$COMPOSE_FILE" up -d

    if [ $? -eq 0 ]; then
        log_success "배포 완료"
        status
        healthcheck
    else
        log_error "배포 실패"
        exit 1
    fi
}

# 업데이트 (새 이미지로 교체)
update() {
    log_info "RetireFarm Manager 업데이트 중..."

    # 현재 상태 백업
    log_info "업데이트 전 백업 생성..."
    backup

    # 새 이미지 pull (로그인 상태 확인 후 필요시 로그인)
    pull_image

    # 컨테이너 재시작
    log_info "컨테이너 업데이트 중..."
    docker-compose -f "$COMPOSE_FILE" up -d

    if [ $? -eq 0 ]; then
        log_success "업데이트 완료"
        status
        healthcheck
    else
        log_error "업데이트 실패"
        exit 1
    fi
}

# 시작
start() {
    log_info "$APP_NAME 시작 중..."
    docker-compose -f "$COMPOSE_FILE" up -d

    if [ $? -eq 0 ]; then
        log_success "$APP_NAME 시작됨"
        status
        healthcheck
    else
        log_error "시작 실패"
        exit 1
    fi
}

# 중지
stop() {
    log_info "$APP_NAME 중지 중..."
    docker-compose -f "$COMPOSE_FILE" down

    if [ $? -eq 0 ]; then
        log_success "$APP_NAME 중지됨"
    else
        log_error "중지 실패"
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
    docker-compose -f "$COMPOSE_FILE" ps 2>/dev/null || echo "컨테이너가 실행 중이지 않습니다."
    echo ""

    # 현재 이미지 정보
    log_info "현재 이미지:"
    docker images "$IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.CreatedSince}}\t{{.Size}}" 2>/dev/null || true
    echo ""
}

# 헬스체크
healthcheck() {
    local max_attempts=${1:-15}
    local wait_seconds=${2:-3}

    log_info "헬스체크 중... (최대 ${max_attempts}회 시도)"

    for i in $(seq 1 $max_attempts); do
        HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3024 2>/dev/null || echo "000")

        if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "302" ] || [ "$HTTP_STATUS" = "307" ]; then
            log_success "애플리케이션 정상 응답 (HTTP $HTTP_STATUS)"
            log_info "접속 URL: http://localhost:3024"
            return 0
        fi

        if [ $i -lt $max_attempts ]; then
            echo -ne "\r  시도 $i/$max_attempts - 대기 중... (HTTP $HTTP_STATUS)"
            sleep $wait_seconds
        fi
    done

    echo ""
    log_warning "애플리케이션이 아직 준비되지 않았습니다."
    log_info "'$0 logs'로 로그를 확인하세요."
    return 1
}

# 로그 보기
logs() {
    docker-compose -f "$COMPOSE_FILE" logs -f --tail=100
}

# 백업
backup() {
    log_info "데이터베이스 백업 중..."

    mkdir -p "$BACKUP_DIR"

    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.db"
    CONTAINER_NAME="retirefarm-app"

    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        docker cp "${CONTAINER_NAME}:/app/prisma/data/${DB_FILE}" "$BACKUP_FILE" 2>/dev/null
    else
        log_warning "컨테이너가 실행 중이지 않습니다. 볼륨에서 직접 백업을 시도합니다."
        docker run --rm \
            -v retirefarm-manager_sqlite_data:/data \
            -v "$BACKUP_DIR":/backup \
            alpine cp "/data/${DB_FILE}" "/backup/backup_$TIMESTAMP.db" 2>/dev/null
    fi

    if [ $? -eq 0 ] && [ -f "$BACKUP_FILE" ]; then
        gzip "$BACKUP_FILE"
        log_success "백업 완료: ${BACKUP_FILE}.gz"

        # 30일 이상 된 백업 삭제
        find "$BACKUP_DIR" -name "backup_*.db.gz" -mtime +30 -delete 2>/dev/null || true
    else
        rm -f "$BACKUP_FILE"
        log_error "백업 실패"
        exit 1
    fi
}

# 정리 (오래된 이미지 삭제)
clean() {
    log_info "오래된 이미지 정리 중..."

    # 현재 사용 중인 이미지 제외하고 삭제
    docker image prune -f

    # dangling 이미지 삭제
    docker images "$IMAGE_NAME" --filter "dangling=true" -q | xargs -r docker rmi 2>/dev/null || true

    log_success "정리 완료"
}

# 도움말
show_help() {
    echo ""
    echo "=========================================="
    echo "  RetireFarm Manager - NAS 배포 스크립트"
    echo "=========================================="
    echo ""
    echo "사용법: $0 [명령어]"
    echo ""
    echo "명령어:"
    echo "  login    - GHCR 로그인 (대화형, 최초 1회)"
    echo "  pull     - 최신 이미지 다운로드"
    echo "  deploy   - 초기 배포 (로그인 + pull + 시작)"
    echo "  update   - 업데이트 (백업 + pull + 재시작)"
    echo "  start    - 컨테이너 시작"
    echo "  stop     - 컨테이너 중지"
    echo "  restart  - 컨테이너 재시작"
    echo "  status   - 상태 확인"
    echo "  logs     - 로그 보기"
    echo "  backup   - 데이터베이스 백업"
    echo "  clean    - 오래된 이미지 정리"
    echo "  health   - 헬스체크"
    echo "  help     - 도움말"
    echo ""
    echo "환경 변수:"
    echo "  GHCR_USERNAME  - GitHub Username (기본: hyunjoonkwak)"
    echo "  IMAGE_TAG      - 이미지 태그 (기본: latest)"
    echo ""
    echo "예시:"
    echo "  $0 deploy        # 초기 배포"
    echo "  $0 update        # 업데이트"
    echo "  IMAGE_TAG=v1.0.0 $0 update  # 특정 버전으로 업데이트"
    echo ""
}

# 메인
case "$1" in
    login)
        ghcr_login
        ;;
    pull)
        ghcr_login
        pull_image
        ;;
    deploy)
        deploy
        ;;
    update)
        update
        ;;
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
    backup)
        backup
        ;;
    clean)
        clean
        ;;
    health|healthcheck)
        healthcheck
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
