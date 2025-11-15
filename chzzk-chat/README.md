# chzzk-chat

치지직(Chzzk) 실시간 채팅 스크래퍼 및 분석 도구

## 목차

- [개요](#개요)
- [주요 기능](#주요-기능)
- [시스템 요구사항](#시스템-요구사항)
- [설치](#설치)
- [사용법](#사용법)
- [아키텍처](#아키텍처)
- [API 엔드포인트](#api-엔드포인트)
- [WebSocket 프로토콜](#websocket-프로토콜)
- [데이터 구조](#데이터-구조)
- [분석 기능](#분석-기능)
- [프로젝트 구조](#프로젝트-구조)
- [의존성](#의존성)
- [성능 고려사항](#성능-고려사항)
- [트러블슈팅](#트러블슈팅)
- [개발 가이드](#개발-가이드)
- [라이선스](#라이선스)
- [기여](#기여)

## 개요

`chzzk-chat`은 네이버 치지직(Chzzk) 플랫폼의 실시간 채팅을 수집하고 분석하는 Rust 기반 고성능 도구입니다. 

이 도구는 다음과 같은 목적으로 설계되었습니다:
- **실시간 채팅 수집**: 인기 라이브 방송의 실시간 채팅을 WebSocket을 통해 효율적으로 수집
- **대규모 데이터 분석**: 수집된 채팅 로그를 분석하여 통계, 패턴, 인사이트 추출
- **채널 관계 분석**: 채널 간 시청자 교집합을 기반으로 한 네트워크 분석
- **유사 콘텐츠 클러스터링**: 시청자 패턴을 기반으로 유사한 다시보기 콘텐츠 그룹화

Rust의 비동기 프로그래밍과 병렬 처리 기능을 활용하여 높은 성능과 안정성을 제공합니다.

## 주요 기능

### 1. 실시간 채팅 수집 (Live Chat Collection)

- **자동 채널 스캔**: 인기 라이브 방송 목록을 자동으로 스캔
- **병렬 처리**: 여러 채널의 채팅을 동시에 수집하여 효율성 극대화
- **필터링 옵션**: 
  - 최소 동시 시청자 수 기준 필터링
  - 성인 콘텐츠 자동 제외
  - 팔로워 수 기반 필터링
- **자동 재연결**: WebSocket 연결이 끊어져도 자동으로 재연결 시도
- **라이브 상태 모니터링**: 주기적으로 채널의 라이브 상태를 확인하여 종료된 방송 자동 감지

### 2. 채팅 분석 (Chat Analysis)

- **기본 통계**:
  - 총 메시지 수
  - 고유 사용자 수 (user_id 기준)
  - 고유 닉네임 수
  - 사용자별 메시지 수
  - 닉네임별 메시지 수
  - 채팅 시간 범위 및 지속 시간

- **채널 간 거리 분석**:
  - Jaccard 거리를 사용한 채널 간 유사도 계산
  - 시청자 교집합 기반 네트워크 그래프 생성
  - 채널 간 연결 강도 측정

- **유사 콘텐츠 클러스터링**:
  - 시청자 패턴 기반 유사 다시보기 그룹화
  - 클러스터링 임계값 조정 가능

- **사용자 수 기반 필터링**:
  - 고유 사용자 수 기준으로 채팅 로그 필터링
  - 대규모 데이터셋 처리 최적화

### 3. 데이터 처리

- **병렬 로딩**: Rayon을 사용한 병렬 데이터 로딩
- **메모리 효율성**: 스트리밍 방식의 데이터 처리
- **진행 표시**: Indicatif을 사용한 진행 상황 표시

## 시스템 요구사항

- **Rust**: 1.70 이상
- **Cargo**: Rust 패키지 매니저
- **운영체제**: Windows, Linux, macOS
- **네트워크**: 인터넷 연결 (치지직 API 및 WebSocket 접근 필요)
- **메모리**: 최소 512MB (대규모 데이터 분석 시 더 많은 메모리 권장)

## 설치

### 1. 저장소 클론

```bash
git clone <repository-url>
cd chzzk-chat
```

### 2. 빌드

디버그 빌드:
```bash
cargo build
```

릴리스 빌드 (최적화된 버전):
```bash
cargo build --release
```

빌드된 실행 파일은 `target/release/chzzk-chat` (또는 Windows의 경우 `target/release/chzzk-chat.exe`)에 생성됩니다.

### 3. 설치 (선택사항)

시스템 전역에 설치하려면:
```bash
cargo install --path .
```

## 사용법

### 실시간 채팅 테스트 모드

실시간 채팅을 수집하는 모드입니다. 인기 라이브 방송을 스캔하고 WebSocket을 통해 채팅을 수집합니다.

#### 기본 사용법

```bash
cargo run --release -- live-chat-test
```

또는 빌드된 실행 파일 사용:
```bash
./target/release/chzzk-chat live-chat-test
```

#### 환경 변수

- `MIN_LIVE_USER`: 최소 동시 시청자 수 (기본값: 100)
  - 이 값 이상의 시청자를 가진 라이브 방송만 수집 대상이 됩니다.
  - 값이 낮을수록 더 많은 채널을 수집하지만, 리소스 사용량이 증가합니다.

#### 사용 예시

```bash
# 기본 설정으로 실행 (최소 100명)
cargo run --release -- live-chat-test

# 최소 500명 이상의 시청자를 가진 방송만 수집
MIN_LIVE_USER=500 cargo run --release -- live-chat-test

# Windows PowerShell에서
$env:MIN_LIVE_USER=500; cargo run --release -- live-chat-test

# Windows CMD에서
set MIN_LIVE_USER=500 && cargo run --release -- live-chat-test
```

#### 출력 형식

실시간 채팅 수집 모드에서는 다음과 같은 형식으로 채팅 메시지가 출력됩니다:

```
CHAT channelId=<채널ID> userId=<사용자ID>, msg=<메시지 내용>
```

예시:
```
CHAT channelId=57c917f1bc650791d8ca3fec1ebcca18 userId=user123, msg=안녕하세요!
```

#### 동작 방식

1. 치지직 API를 통해 인기 라이브 방송 목록을 가져옵니다.
2. `MIN_LIVE_USER` 값 이상의 시청자를 가진 방송만 필터링합니다.
3. 성인 콘텐츠는 자동으로 제외됩니다.
4. 각 채널의 상세 정보와 채팅 채널 ID를 병렬로 가져옵니다.
5. 각 채널의 채팅 채널에 WebSocket으로 연결합니다.
6. 실시간으로 수신되는 채팅 메시지를 처리합니다.
7. 20초마다 PING 메시지를 전송하여 연결을 유지합니다.
8. 주기적으로 채널의 라이브 상태를 확인하여 종료된 방송은 자동으로 연결을 종료합니다.

### 채팅 분석 모드

수집된 채팅 로그를 분석하는 모드입니다. 채널 정보와 채팅 로그를 로드하여 다양한 분석을 수행합니다.

#### 기본 사용법

```bash
cargo run --release -- analysis-chat --files <파일경로1> <파일경로2> ...
```

#### 옵션

- `--files`: 분석할 채널 및 리플레이 데이터 파일 경로 (여러 개 지정 가능)
  - 파일 경로를 지정하지 않으면 기본 경로를 사용합니다.

#### 기본 파일 경로

파일 경로를 지정하지 않으면 다음 기본 경로를 사용합니다:
- `../web/public/channel_with_replays_0.json`
- `../web/public/channel_with_replays_1.json`

#### 채팅 로그 디렉토리

채팅 로그는 다음 디렉토리에서 자동으로 로드됩니다:
- `../chat_logs`

#### 사용 예시

```bash
# 기본 파일 경로 사용
cargo run --release -- analysis-chat

# 특정 파일 지정
cargo run --release -- analysis-chat --files ../web/public/channel_with_replays_0.json

# 여러 파일 지정
cargo run --release -- analysis-chat --files \
    ../web/public/channel_with_replays_0.json \
    ../web/public/channel_with_replays_1.json \
    ../web/public/channel_with_replays_2.json
```

#### 분석 기능

현재 구현된 분석 기능:

1. **고유 사용자 수 필터링**: 
   - 기본적으로 10,000명 이상의 고유 사용자를 가진 채팅 로그만 분석합니다.
   - 코드에서 임계값을 조정할 수 있습니다.

2. **채널 간 거리 계산**:
   - Jaccard 거리를 사용하여 채널 간 유사도를 계산합니다.
   - 시청자 교집합을 기반으로 네트워크 그래프를 생성합니다.
   - 결과를 JSON 형식으로 내보냅니다.

3. **유사 다시보기 클러스터링**:
   - 시청자 패턴을 기반으로 유사한 다시보기 콘텐츠를 그룹화합니다.
   - 클러스터링 임계값: 0.1 (코드에서 조정 가능)

## 아키텍처

### 전체 구조

```
┌─────────────────────────────────────────────────────────┐
│                      main.rs                           │
│  ┌──────────────┐              ┌──────────────┐        │
│  │ LiveChatTest │              │ AnalysisChat │        │
│  └──────┬───────┘              └──────┬───────┘        │
└─────────┼─────────────────────────────┼────────────────┘
          │                              │
          ▼                              ▼
┌─────────────────┐            ┌─────────────────┐
│   api 모듈      │            │   data 모듈      │
│                 │            │                 │
│ ┌───────────┐  │            │ ┌───────────┐  │
│ │ scanner   │  │            │ │ analyzer │  │
│ │ client    │  │            │ │ loader   │  │
│ │ websocket │  │            │ │ timeline │  │
│ │ models    │  │            │ │ models   │  │
│ └───────────┘  │            │ └───────────┘  │
└─────────────────┘            └─────────────────┘
```

### 실시간 채팅 수집 플로우

```
1. scan_channels()
   │
   ├─► fetch_lives_pages() ──► API 호출 (페이지네이션)
   │
   ├─► 필터링 (MIN_LIVE_USER, adult)
   │
   ├─► 병렬 처리 (join_all)
   │   │
   │   ├─► fetch_channel() ──► 채널 상세 정보
   │   └─► fetch_live_detail() ──► 채팅 채널 ID
   │
   └─► spawn_scrape_chats() ──► WebSocket 연결
       │
       ├─► WebSocket 연결 (wss://kr-ss1.chat.naver.com/chat)
       │
       ├─► INIT 메시지 전송
       │
       ├─► 메시지 수신 루프
       │   │
       │   ├─► PING/PONG 처리
       │   └─► 채팅 메시지 처리 (cmd: 93101)
       │
       └─► 주기적 상태 확인 (20초마다)
```

### 데이터 분석 플로우

```
1. load_channels_and_chat_logs()
   │
   ├─► load_channel_with_replays() ──► JSON 파일 로드
   └─► load_all_chat_logs() ──► 채팅 로그 디렉토리 스캔
   
2. filter_chat_logs_by_user_count()
   └─► 고유 사용자 수 기준 필터링
   
3. 분석 함수들
   │
   ├─► calculate_channel_distances() ──► 채널 간 거리 계산
   │   └─► Jaccard 거리 계산
   │
   └─► cluster_similar_replays() ──► 유사 콘텐츠 클러스터링
```

## API 엔드포인트

### 치지직 API

이 도구는 다음 치지직 API 엔드포인트를 사용합니다:

#### 1. 라이브 방송 목록 조회

```
GET https://api.chzzk.naver.com/service/v1/lives
```

**쿼리 파라미터:**
- `size`: 페이지 크기 (기본값: 50)
- `sortType`: 정렬 타입 (기본값: POPULAR)
- `concurrentUserCount`: 다음 페이지를 위한 커서 (선택사항)
- `liveId`: 다음 페이지를 위한 커서 (선택사항)

**응답 구조:**
```json
{
  "content": {
    "data": [
      {
        "concurrentUserCount": 1234,
        "adult": false,
        "chatChannelId": "...",
        "channel": {
          "channelId": "..."
        }
      }
    ],
    "page": {
      "next": {
        "concurrentUserCount": 1234,
        "liveId": 5678
      }
    }
  }
}
```

#### 2. 채널 상세 정보 조회

```
GET https://api.chzzk.naver.com/service/v1/channels/{channelId}
```

**응답 구조:**
```json
{
  "content": {
    "channelId": "...",
    "followerCount": 12345,
    "openLive": true
  }
}
```

#### 3. 라이브 상세 정보 조회

```
GET https://api.chzzk.naver.com/service/v3/channels/{channelId}/live-detail
```

**응답 구조:**
```json
{
  "content": {
    "chatChannelId": "..."
  }
}
```

## WebSocket 프로토콜

### 연결

- **엔드포인트**: `wss://kr-ss1.chat.naver.com/chat`
- **프로토콜**: WebSocket (WSS)

### 메시지 형식

모든 메시지는 JSON 형식입니다.

#### INIT 메시지 (클라이언트 → 서버)

연결 후 첫 번째로 전송하는 초기화 메시지입니다.

```json
{
  "ver": "3",
  "cmd": 100,
  "svcid": "game",
  "cid": "<chat_channel_id>",
  "tid": 1,
  "bdy": {
    "uid": null,
    "devType": 2001,
    "accTkn": null,
    "auth": "READ",
    "libVer": null,
    "osVer": null,
    "devName": null,
    "locale": null,
    "timezone": null
  }
}
```

**필드 설명:**
- `ver`: 프로토콜 버전 (현재: "3")
- `cmd`: 명령 코드 (100 = INIT)
- `svcid`: 서비스 ID ("game")
- `cid`: 채팅 채널 ID
- `tid`: 트랜잭션 ID
- `bdy`: 메시지 본문
  - `auth`: 인증 타입 ("READ" = 읽기 전용)

#### PING 메시지 (클라이언트 → 서버)

연결 유지를 위해 주기적으로 전송합니다 (20초마다).

```json
{
  "ver": 3,
  "cmd": 0
}
```

#### PONG 메시지 (클라이언트 → 서버)

서버의 PING에 대한 응답입니다.

```json
{
  "ver": 3,
  "cmd": 10000
}
```

#### 채팅 메시지 (서버 → 클라이언트)

실시간 채팅 메시지를 수신합니다.

```json
{
  "ver": 3,
  "cmd": 93101,
  "bdy": [
    {
      "uid": "<user_id>",
      "msg": "<message_content>",
      ...
    }
  ]
}
```

**명령 코드:**
- `0`: 서버 PING
- `100`: INIT (클라이언트에서만 사용)
- `10000`: PONG
- `93101`: 채팅 메시지

### 연결 유지

- **PING 주기**: 20초마다 클라이언트에서 PING 전송
- **상태 확인**: 20초마다 채널의 라이브 상태 확인
- **자동 종료**: 라이브가 종료되면 자동으로 연결 종료

## 데이터 구조

### API 모델

#### Live

```rust
pub struct Live {
    pub concurrent_user_count: u64,  // 동시 시청자 수
    pub adult: bool,                  // 성인 콘텐츠 여부
    pub chat_channel_id: Option<String>,  // 채팅 채널 ID (사용 안 함)
    pub channel: ChannelInfo,          // 채널 정보
}
```

#### ChannelDetail

```rust
pub struct ChannelDetail {
    pub channel_id: String,           // 채널 ID
    pub follower_count: Option<u64>,   // 팔로워 수
    pub open_live: Option<bool>,       // 라이브 중 여부
}
```

#### LiveDetail

```rust
pub struct LiveDetail {
    pub chat_channel_id: Option<String>,  // 채팅 채널 ID
}
```

#### LiveReady

스크래핑에 필요한 최소 정보만 모아놓은 구조체입니다.

```rust
pub struct LiveReady {
    pub channel_id: String,           // 채널 ID
    pub chat_channel_id: String,       // 채팅 채널 ID
    pub follower_count: u64,           // 팔로워 수
}
```

### 데이터 모델

#### ChannelWithReplays

```rust
pub struct ChannelWithReplays {
    pub name: String,                  // 채널 이름
    pub follower: u64,                 // 팔로워 수
    pub channel_id: String,            // 채널 ID
    pub image: Option<String>,         // 채널 이미지 URL
    pub replays: Vec<Replay>,          // 다시보기 목록
}
```

#### Replay

```rust
pub struct Replay {
    pub title: String,                 // 제목
    pub start: String,                 // 시작 시간
    pub end: String,                   // 종료 시간
    pub video_no: u64,                 // 비디오 번호
    pub thumbnail: Option<String>,     // 썸네일 URL
    pub tags: Vec<String>,             // 태그 목록
    pub category_ko: Option<String>,  // 카테고리 (한국어)
}
```

#### ChatLog

```rust
pub struct ChatLog {
    pub video_id: u64,                 // 비디오 ID
    pub messages: Vec<ChatMessage>,    // 채팅 메시지 목록
}
```

#### ChatMessage

```rust
pub struct ChatMessage {
    pub timestamp: DateTime<FixedOffset>,  // 타임스탬프
    pub nickname: String,                  // 닉네임
    pub message: String,                   // 메시지 내용
    pub user_id: String,                    // 사용자 ID
}
```

#### ChatAnalysis

채팅 로그 분석 결과입니다.

```rust
pub struct ChatAnalysis {
    pub total_messages: usize,                    // 총 메시지 수
    pub unique_users: usize,                      // 고유 사용자 수
    pub unique_nicknames: usize,                  // 고유 닉네임 수
    pub messages_per_user: HashMap<String, usize>,      // 사용자별 메시지 수
    pub messages_per_nickname: HashMap<String, usize>,   // 닉네임별 메시지 수
    pub first_message_time: Option<DateTime<FixedOffset>>,  // 첫 메시지 시간
    pub last_message_time: Option<DateTime<FixedOffset>>,    // 마지막 메시지 시간
    pub duration_seconds: Option<i64>,            // 지속 시간 (초)
}
```

## 분석 기능

### 1. 채널 간 거리 계산

Jaccard 거리를 사용하여 채널 간 유사도를 계산합니다.

**공식:**
```
Jaccard 거리 = 1 - (교집합 크기 / 합집합 크기)
```

**사용 예시:**
```rust
let (nodes, links) = calculate_channel_distances(
    &chat_logs,
    &channels,
    None  // 최대 노드 수 제한 (None = 제한 없음)
);
```

**출력 형식:**
- `nodes`: 채널 노드 정보 (ID, 이름, 팔로워 수, 채팅 수)
- `links`: 채널 간 연결 정보 (source, target, 교집합 크기, 거리)

### 2. 유사 다시보기 클러스터링

시청자 패턴을 기반으로 유사한 다시보기 콘텐츠를 그룹화합니다.

**사용 예시:**
```rust
let clusters = cluster_similar_replays(
    &channels,
    &chat_logs,
    0.1  // 클러스터링 임계값
);
```

**임계값:**
- 낮은 값 (0.0 ~ 0.3): 더 엄격한 클러스터링, 작은 그룹
- 높은 값 (0.7 ~ 1.0): 더 느슨한 클러스터링, 큰 그룹

### 3. 사용자 수 기반 필터링

고유 사용자 수를 기준으로 채팅 로그를 필터링합니다.

**사용 예시:**
```rust
let filtered = filter_chat_logs_by_user_count(
    chat_logs,
    10000  // 최대 고유 사용자 수
);
```

## 프로젝트 구조

```
chzzk-chat/
├── src/
│   ├── main.rs                    # 메인 엔트리포인트 및 CLI
│   │
│   ├── api/                       # API 클라이언트 모듈
│   │   ├── mod.rs                 # 모듈 선언
│   │   ├── client.rs              # HTTP API 클라이언트
│   │   │   ├── fetch_lives()      # 라이브 목록 조회
│   │   │   ├── fetch_lives_pages() # 페이지네이션 처리
│   │   │   ├── fetch_channel()    # 채널 상세 정보 조회
│   │   │   └── fetch_live_detail() # 라이브 상세 정보 조회
│   │   ├── models.rs              # API 응답 모델
│   │   ├── scanner.rs              # 채널 스캐너
│   │   │   └── scan_channels()    # 채널 스캔 및 필터링
│   │   └── websocket.rs            # WebSocket 클라이언트
│   │       ├── spawn_scrape_chats() # WebSocket 태스크 스폰
│   │       ├── scrape_chats()      # WebSocket 연결 및 메시지 처리
│   │       └── handle_ws_message() # WebSocket 메시지 핸들러
│   │
│   ├── data/                      # 데이터 처리 모듈
│   │   ├── mod.rs                 # 모듈 선언
│   │   ├── models.rs              # 데이터 모델
│   │   ├── loader.rs              # 데이터 로더
│   │   │   └── load_channel_with_replays() # 채널 데이터 로드
│   │   ├── chat_loader.rs         # 채팅 로그 로더
│   │   │   └── load_all_chat_logs() # 모든 채팅 로그 로드
│   │   ├── chat_analyzer.rs        # 채팅 분석기
│   │   │   ├── analyze_chat_log()  # 단일 채팅 로그 분석
│   │   │   ├── calculate_channel_distances() # 채널 간 거리 계산
│   │   │   ├── cluster_similar_replays() # 유사 콘텐츠 클러스터링
│   │   │   └── filter_chat_logs_by_user_count() # 사용자 수 필터링
│   │   └── timeline.rs            # 타임라인 처리
│   │
│   └── utils.rs                    # 유틸리티 함수
│       ├── log()                   # 로그 출력 (KST 기준)
│       ├── create_progress_bar()   # 진행 표시줄 생성
│       └── SCRAPING_CHANNELS       # 스크래핑 중인 채널 Set
│
├── Cargo.toml                     # 프로젝트 설정 및 의존성
├── Cargo.lock                     # 의존성 버전 고정
├── rustfmt.toml                   # Rust 포맷팅 설정
└── README.md                      # 이 파일
```

## 의존성

### 핵심 의존성

- **tokio** (1.x): 비동기 런타임
  - `full` 기능: 모든 Tokio 기능 활성화
- **reqwest** (0.12): HTTP 클라이언트
  - `json`: JSON 직렬화/역직렬화
  - `rustls-tls`: TLS 지원 (Rustls 사용)
- **tokio-tungstenite** (0.24): WebSocket 클라이언트
  - `rustls-tls-native-roots`: TLS 지원
- **serde** (1.x): 직렬화/역직렬화 프레임워크
  - `derive`: 자동 derive 매크로
- **serde_json** (1.x): JSON 처리
- **futures** (0.3): 비동기 유틸리티
  - `join_all`: 여러 future 병렬 실행
- **dashmap** (6.x): 동시성 맵 (스레드 안전)
- **chrono** (0.4): 날짜/시간 처리
  - `clock`: 시계 기능
- **color-eyre** (0.6): 에러 처리 및 보고
- **structopt** (0.3.26): CLI 인자 파싱
- **regex** (1.x): 정규표현식
- **rayon** (1.x): 데이터 병렬 처리
- **indicatif** (0.17): 진행 표시줄

### 의존성 선택 이유

- **Tokio**: Rust의 표준 비동기 런타임으로 높은 성능과 안정성 제공
- **Reqwest**: 비동기 HTTP 클라이언트로 API 호출 최적화
- **Tokio-tungstenite**: WebSocket 통신을 위한 안정적인 라이브러리
- **DashMap**: 스레드 안전한 맵으로 동시성 처리 최적화
- **Rayon**: 데이터 병렬 처리를 통한 성능 향상
- **Color-eyre**: 사용자 친화적인 에러 메시지 제공

## 성능 고려사항

### 병렬 처리

- **채널 정보 수집**: `tokio::join!`을 사용하여 채널 상세 정보와 라이브 상세 정보를 동시에 가져옵니다.
- **여러 채널 처리**: `futures::join_all`을 사용하여 여러 채널의 정보를 병렬로 수집합니다.
- **데이터 분석**: Rayon을 사용하여 CPU 집약적인 작업을 병렬로 처리합니다.

### 메모리 관리

- **스트리밍 처리**: 가능한 경우 스트리밍 방식으로 데이터를 처리하여 메모리 사용량을 최소화합니다.
- **불필요한 데이터 제거**: 필요한 데이터만 메모리에 유지합니다.

### 네트워크 최적화

- **연결 풀링**: Reqwest의 기본 연결 풀을 활용합니다.
- **타임아웃**: 적절한 타임아웃 설정으로 무한 대기 방지
- **재시도 로직**: 네트워크 오류 시 자동 재시도 (필요시 구현)

### 권장 사항

- **MIN_LIVE_USER 조정**: 시스템 리소스에 맞게 최소 시청자 수를 조정하세요.
  - 낮은 값: 더 많은 채널 수집, 높은 리소스 사용
  - 높은 값: 적은 채널 수집, 낮은 리소스 사용
- **동시 연결 수 제한**: 너무 많은 WebSocket 연결은 시스템 리소스를 고갈시킬 수 있습니다.
- **대규모 데이터 분석**: 메모리가 충분한 시스템에서 실행하세요.

## 트러블슈팅

### 일반적인 문제

#### 1. 빌드 오류

**문제**: `cargo build` 실행 시 오류 발생

**해결 방법**:
- Rust 버전 확인: `rustc --version` (1.70 이상 필요)
- Cargo 업데이트: `rustup update`
- 의존성 정리: `cargo clean && cargo build`

#### 2. WebSocket 연결 실패

**문제**: WebSocket 연결이 실패하거나 자주 끊어짐

**가능한 원인**:
- 네트워크 연결 문제
- 방화벽 설정
- 치지직 서버 문제

**해결 방법**:
- 네트워크 연결 확인
- 방화벽 설정 확인
- 잠시 후 재시도

#### 3. API 호출 실패

**문제**: API 호출이 실패하거나 429 (Too Many Requests) 오류

**가능한 원인**:
- API 요청 제한 초과
- 잘못된 채널 ID

**해결 방법**:
- 요청 간격 조정 (코드 수정 필요)
- 유효한 채널 ID 확인

#### 4. 메모리 부족

**문제**: 대규모 데이터 분석 시 메모리 부족

**해결 방법**:
- 데이터 필터링 강화 (사용자 수 기준)
- 배치 처리로 데이터 분할
- 시스템 메모리 증가

### 로그 확인

프로그램 실행 시 다음과 같은 로그가 출력됩니다:

```
2024-01-01 12:00:00 실시간 채팅 테스트 모드 시작
2024-01-01 12:00:01 Starting scan with MIN_LIVE_USER = 100
2024-01-01 12:00:05 Opened! channel_id=... scrapingChannels=1
```

로그를 통해 각 단계의 진행 상황을 확인할 수 있습니다.

### 디버깅

디버그 빌드로 실행하여 더 자세한 정보를 확인할 수 있습니다:

```bash
cargo build
cargo run -- live-chat-test
```

또는 `RUST_BACKTRACE=1` 환경 변수를 설정하여 스택 트레이스를 확인할 수 있습니다:

```bash
RUST_BACKTRACE=1 cargo run --release -- live-chat-test
```

## 개발 가이드

### 코드 스타일

- Rust 표준 스타일 가이드 준수
- `rustfmt`를 사용한 자동 포맷팅: `cargo fmt`
- `clippy`를 사용한 린팅: `cargo clippy`

### 테스트

현재 테스트는 구현되지 않았습니다. 향후 추가 예정입니다.

### 새로운 기능 추가

1. **새로운 API 엔드포인트 추가**:
   - `src/api/client.rs`에 함수 추가
   - `src/api/models.rs`에 응답 모델 추가

2. **새로운 분석 기능 추가**:
   - `src/data/chat_analyzer.rs`에 함수 추가
   - 필요시 `src/data/models.rs`에 모델 추가

3. **새로운 CLI 명령 추가**:
   - `src/main.rs`의 `Opt` enum에 variant 추가
   - 해당하는 실행 함수 구현

### 성능 최적화

- 프로파일링 도구 사용: `cargo install flamegraph`
- 병렬 처리 최적화: Rayon 설정 조정
- 메모리 프로파일링: `valgrind` 또는 `heaptrack` 사용

## 라이선스

[라이선스 정보를 여기에 추가하세요]

## 기여

기여를 환영합니다! 다음 방법으로 기여할 수 있습니다:

1. **이슈 리포트**: 버그나 개선 사항을 이슈로 등록해주세요.
2. **Pull Request**: 코드 개선이나 새로운 기능을 PR로 제출해주세요.
3. **문서 개선**: README나 코드 주석 개선도 환영합니다.

### 기여 가이드라인

- 코드 스타일 준수 (`cargo fmt`, `cargo clippy`)
- 의미 있는 커밋 메시지 작성
- 변경 사항에 대한 설명 포함
- 가능한 경우 테스트 추가

---

**문의사항이나 제안사항이 있으시면 이슈를 등록해주세요!**
