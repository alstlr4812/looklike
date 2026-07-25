# LOOKLIKE - 닮은 사진 게시판

서로 닮은 사진 두 장을 나란히 올리는 게시판입니다. 실제 배포 가능한 구조로 되어 있어요.

```
looklike/
├── backend/     Express API 서버 (PostgreSQL + 이미지 검열 + 신고/삭제)
└── frontend/    React(Vite) 웹사이트
```

## 아키텍처 한눈에 보기

```
[사용자 브라우저]
      │  HTTPS
      ▼
[프론트엔드: Vite/React] ──정적 배포 (Vercel/Netlify/Cloudflare Pages)
      │  REST API (fetch)
      ▼
[백엔드: Express API] ──서버 배포 (Render Free Web Service 등)
      │
      ├─ PostgreSQL (게시물, 신고 내역) ── Render 무료 Postgres
      ├─ 이미지 저장 (Cloudflare R2, S3 호환) ── 완전 무료 티어
      └─ 이미지 검열 API 호출 (Sightengine 등)
```

**왜 이 조합인가요?** Render의 무료 웹 서비스는 디스크가 영구 저장되지 않아서(재배포/재시작 시 파일이 사라짐), 이미지와 DB를 서버 밖(R2, 별도 Postgres)에 둬야 완전 무료로 안정적으로 운영할 수 있어요.

## 로컬에서 실행해보기

```bash
# 백엔드
cd backend
cp .env.example .env   # 값 채워넣기 (로컬 테스트는 STORAGE_DRIVER=local로 바꾸고 DATABASE_URL만 있으면 됨)
npm install
npm run dev             # http://localhost:8080

# 프론트엔드 (새 터미널)
cd frontend
cp .env.example .env    # VITE_API_BASE_URL=http://localhost:8080
npm install
npm run dev              # http://localhost:5173
```

## 실제 배포 순서 (완전 무료 구성)

1. **Postgres 데이터베이스 만들기** (Render)
   - Render 대시보드 → **New +** → **PostgreSQL**
   - Instance Type **Free** 선택 → 이름 아무거나 → **Create Database**
   - 생성되면 **Internal Database URL**(같은 Render 안의 백엔드에서 쓸 주소) 또는 **External Database URL**을 복사

2. **Cloudflare R2 버킷 만들기** (이미지 저장용)
   - [dash.cloudflare.com](https://dash.cloudflare.com) 가입 → 왼쪽 메뉴 **R2** → **Create bucket** → 이름 예: `looklike-images`
   - 버킷 생성 후 **Settings** 탭 → **Public Access** → **Allow Access** (r2.dev 서브도메인 활성화) → 나오는 주소가 `S3_PUBLIC_URL_BASE`
   - 왼쪽 메뉴 **R2** → **Manage R2 API Tokens** → **Create API Token** → 권한 Object Read & Write → 생성 후 나오는 **Access Key ID / Secret Access Key / Endpoint** 를 각각 `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_ENDPOINT`에 사용

3. **백엔드 배포** (Render Web Service)
   - 저장소를 연결하고 `backend` 폴더를 루트로 지정, Start Command `npm start`
   - `.env.example`을 참고해 환경변수 등록:
     - `DATABASE_URL` = 1번에서 복사한 Postgres URL
     - `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION=auto`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_PUBLIC_URL_BASE` = 2번에서 얻은 값들
     - `ADMIN_API_KEY` = 긴 랜덤 문자열
     - `MAX_IMAGE_SIZE_MB=20` (원하는 만큼 조절 가능)

4. **프론트엔드 배포** (Vercel, Netlify, Cloudflare Pages 등)
   - `frontend` 폴더를 루트로 지정, Build Command `npm run build`, Output `dist`
   - 환경변수 `VITE_API_BASE_URL`에 배포한 백엔드 주소 입력

5. **도메인 연결**: 각 배포 플랫폼에서 커스텀 도메인 + HTTPS는 자동으로 제공돼요 (Let's Encrypt).

> 로컬 컴퓨터에서 테스트할 때만 `STORAGE_DRIVER=local`로 바꿔서 디스크에 저장해도 돼요 (`.env.example`에 예시 있음). 실서비스 배포는 항상 `s3`를 쓰세요.

## 콘텐츠 검열 (필수 설정)

`backend/src/services/moderation.js`에 이미지 검열이 연동되어 있어요.
- 기본값은 [Sightengine](https://sightengine.com) (누드/폭력/고어 감지) — 무료 티어로 테스트 가능
- `.env`의 `SIGHTENGINE_API_USER`, `SIGHTENGINE_API_SECRET`을 **반드시** 채워 넣으세요. 비워두면 이미지 검열 없이 게시가 허용됩니다.
- AWS Rekognition이나 Google Cloud Vision SafeSearch로 바꾸고 싶다면 `moderateImage()` 함수 내부만 교체하면 돼요.
- 텍스트(닉네임/캡션)는 간단한 금칙어 필터가 기본 적용되어 있고, 필요하면 OpenAI Moderation API 등으로 교체할 수 있어요 (파일 내 주석 참고).

## 신고 · 삭제 기능

- **신고**: 누구나 게시물을 신고할 수 있고, 같은 게시물이 `AUTO_HIDE_REPORT_THRESHOLD`(기본 3)회 신고되면 자동으로 비공개 처리돼요.
- **관리자 검토**: `backend/public/moderation.html`을 열어서 (배포된 주소)/moderation.html) API 주소와 관리자 키를 입력하면 비공개된 게시물을 검토해 복구하거나 완전 삭제할 수 있어요.
- **본인 삭제**: 로그인 시스템 없이도, 게시물을 올린 사람의 브라우저에는 삭제 권한 토큰이 저장돼서 본인 게시물만 삭제 버튼이 보여요.

## 광고 수익화

지금은 광고 자리만 표시되는 상태예요 (`banner-ad`, `ad-card`).
1. [Google AdSense](https://www.google.com/adsense)에 가입하고 사이트를 등록해 심사를 받으세요. UGC(사용자 업로드 콘텐츠) 사이트는 검열 체계가 있어야 승인 확률이 높아요.
2. 승인되면 `frontend/index.html`의 안내된 위치에 AdSense 스크립트를 추가하고, `AdCard`/`banner-ad` 자리에 실제 `<ins class="adsbygoogle">` 태그를 넣으면 돼요.
3. 애드센스 외에 Ezoic, Mediavine(트래픽 요건 있음) 등도 UGC 사이트에 많이 쓰여요.

## 배포 전 체크리스트 (법적/운영 고려사항)

- **개인정보처리방침 & 이용약관**: 광고(쿠키 기반 맞춤 광고 포함)와 사용자 업로드가 있으니 필수예요.
- **미성년자/타인 사진 도용 대응**: 신고 사유에 "개인정보 노출"을 넣어뒀지만, 사람이 등장하는 사진이 많다면 검열 서비스만으로는 부족할 수 있어요. 신고 접수 시 빠르게 검토할 운영 인력/프로세스를 준비하세요.
- **DMCA/저작권 신고 대응 절차**를 마련하세요 (신고 사유에 이미 포함되어 있어요).
- **속도 제한**: 업로드/신고 모두 IP 기준 rate limit이 걸려 있지만, 서비스가 커지면 Cloudflare 같은 봇 방어 레이어를 앞단에 두는 걸 추천해요.

## 확장 아이디어

- 좋아요/댓글 기능
- 이메일/소셜 로그인 도입 시 본인 게시물 관리가 더 편해져요
- 이미지 CDN 캐싱 강화 (Cloudflare 앞단에 두면 R2 트래픽도 줄어요)
