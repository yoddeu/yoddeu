# 요뜨(yoddeu)

요뜨는 **요즘 뜨는 것**의 줄임말입니다. 한국 인터넷에서 많이 언급되는 키워드를 카드형 랭킹으로 모아 보여주고, 각 키워드가 왜 뜨는지 짧게 설명하는 트렌드 큐레이션 MVP입니다.

## MVP 방향

- 한국 중심 트렌드
- 키워드 중심 탐색
- 카드형 랭킹 UI
- 일반 대중과 크리에이터 대상
- 초기에는 수동/반자동 큐레이션으로 빠르게 검증

## 실행 방법

정적 사이트 파일은 `site/` 폴더에 있고, 트렌드 데이터는 `site/data/trends.json`에 분리되어 있습니다. `site/app.js`가 해당 데이터를 불러와 카드형 랭킹과 필터를 렌더링합니다. 브라우저 보안 정책 때문에 데이터 로딩 확인은 로컬 서버 또는 GitHub Pages 환경에서 진행하는 것을 권장합니다.

로컬 서버로 확인하려면 다음 명령을 사용합니다.

```bash
python3 -m http.server 4173 --directory site
```

이후 브라우저에서 `http://127.0.0.1:4173/`에 접속합니다.

## 데이터 수정 방법

`site/data/trends.json`에서 키워드, 순위, 상태, 카테고리, 태그, 요약, 출처 수, 업데이트 시간을 수정하면 화면에 자동 반영됩니다. 카테고리 필터는 JSON의 `category` 값을 기준으로 자동 생성되고, 검색은 키워드/카테고리/태그/요약을 대상으로 동작합니다.


## Supabase 초기 설정

요뜨의 클라우드 데이터 저장소는 Supabase PostgreSQL을 기준으로 준비합니다. 테이블 생성 SQL은 `supabase/schema.sql`에 있으며, Supabase 프로젝트의 **SQL Editor**에서 해당 파일 내용을 실행하면 초기 테이블과 공개 조회 정책을 만들 수 있습니다.

초기 스키마에는 다음 테이블이 포함됩니다.

- `trends`: 실제 요뜨 화면에 노출할 트렌드
- `trend_sources`: 트렌드별 출처/집계 정보
- `trend_candidates`: 수집 프로그램이 저장하는 후보 키워드
- `collection_runs`: 수집 작업 실행 기록

보안상 실제 비밀값은 커밋하지 않습니다. 로컬/문서용 예시는 `.env.example`만 사용하고, 실제 값은 로컬 `.env` 또는 GitHub Actions Secrets에 저장합니다. 특히 `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, DB 비밀번호는 브라우저 코드와 GitHub Pages 배포물에 넣으면 안 됩니다.

GitHub Actions에서 향후 수집 프로그램을 실행할 때 필요한 Secrets 예시는 다음과 같습니다.

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_URL
```


## 트렌드 후보 수집기

뉴스 RSS 기반 수집기 초안은 `collector/`에 있습니다. 수집기는 `NEWS_RSS_URLS`에 등록된 RSS/Atom 피드를 읽고 기사 제목에서 후보 키워드를 추출한 뒤 `trend_candidates` 테이블에 저장합니다. 실행 기록은 `collection_runs`에 남깁니다.

로컬에서 문법과 단위 테스트를 확인하려면 다음 명령을 사용합니다.

```bash
cd collector
npm run check
npm test
```

실제 Supabase에 저장하려면 로컬 `.env` 또는 GitHub Actions Secrets/Variables에 다음 값을 설정해야 합니다.

```text
NEWS_RSS_URLS
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

GitHub Actions 수집 워크플로는 `.github/workflows/collect-trends.yml`에 있으며, 매시간 실행되거나 수동으로 실행할 수 있습니다. `NEWS_RSS_URLS`는 GitHub Actions Variables에, `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`는 GitHub Actions Secrets에 저장하세요.


## 후보 집계와 트렌드 승격

수집 성공 후에는 Supabase SQL Editor에서 `supabase/views.sql`을 실행해 후보 집계 View와 승격 함수를 추가합니다.

- `trend_candidate_summary`: `trend_candidates`를 `normalized_keyword`별로 묶어 언급 수, 출처 수, 기사 수, 최근 수집 시각, 점수를 계산합니다.
- `promote_candidate_to_trend(...)`: 후보 하나를 `trends`와 `trend_sources`로 승격합니다. 기본값은 `published=false`라서 운영자가 검수한 뒤 공개할 수 있습니다.

후보 상위 목록은 다음 쿼리로 확인할 수 있습니다.

```sql
select *
from public.trend_candidate_summary
order by score desc, latest_collected_at desc
limit 30;
```

후보를 검수용 트렌드 초안으로 승격하려면 다음처럼 실행합니다.

```sql
select public.promote_candidate_to_trend(
  p_normalized_keyword := 'ai 영상',
  p_category := '테크',
  p_status := '상승 중',
  p_summary := 'AI 영상 관련 뉴스 언급이 증가하고 있어요.',
  p_publish := false
);
```

Supabase Table Editor에서 내용을 확인한 뒤 공개하려면 `trends.published`를 `true`로 변경합니다. 공개 조회 정책은 `published=true`인 트렌드만 읽을 수 있게 설정되어 있습니다.



## Supabase 공개 트렌드 연결

사이트는 기본적으로 Supabase의 `trends` API를 먼저 읽고, 설정이 없거나 공개된 트렌드가 없으면 `site/data/trends.json` 샘플 데이터로 fallback합니다.

GitHub Pages에서 Supabase 데이터를 표시하려면 `site/config.js`에 공개 조회용 값만 설정합니다.

```js
window.YODDEU_CONFIG = {
  SUPABASE_URL: 'https://your-project-ref.supabase.co',
  SUPABASE_ANON_KEY: 'public-anon-or-publishable-key',
};
```

`SUPABASE_ANON_KEY`는 공개 조회용 키만 사용해야 하며, `SUPABASE_SERVICE_ROLE_KEY`는 절대 `site/config.js`나 브라우저 코드에 넣으면 안 됩니다. 현재 RLS 정책은 `published=true`인 `trends`와 해당 출처만 공개 조회되도록 설계되어 있습니다.

## 관리자 페이지 초안

읽기 전용 관리자 페이지 초안은 `site/admin/`에 있습니다. GitHub Pages 배포 후 `/admin/` 경로로 접근할 수 있으며, 현재 버전은 브라우저에 `SUPABASE_SERVICE_ROLE_KEY`를 넣지 않기 위해 DB를 직접 변경하지 않습니다.

관리자 페이지에서는 Supabase SQL Editor에서 조회한 `trend_candidate_summary` JSON 결과를 붙여넣고, 후보별 카테고리/상태/요약을 조정한 뒤 `promote_candidate_to_trend(...)` 실행 SQL을 복사할 수 있습니다. 복사한 SQL은 Supabase SQL Editor에서 실행해 `published=false` 초안으로 승격합니다.


## Supabase Edge Functions

관리자 페이지가 DB를 직접 수정하지 않도록 Edge Function 초안을 `supabase/functions/`에 추가합니다. Edge Function은 서버 측에서 `SUPABASE_SERVICE_ROLE_KEY`를 사용하고, 브라우저는 service role key를 절대 알 필요가 없습니다.

추가된 함수는 다음과 같습니다.

- `list-candidates`: `trend_candidate_summary` 상위 후보를 조회합니다.
- `promote-candidate`: 선택한 후보를 `promote_candidate_to_trend(...)`로 `trends` 초안에 승격합니다.

배포 전 Supabase secrets에 다음 값을 설정합니다.

```bash
supabase secrets set SUPABASE_URL=...
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
supabase secrets set ADMIN_API_KEY=...
supabase secrets set ADMIN_ALLOWED_ORIGIN=https://<github-username>.github.io
```

배포 예시는 다음과 같습니다.

```bash
supabase functions deploy list-candidates
supabase functions deploy promote-candidate
```

초기 버전은 `x-admin-key` 헤더로 관리자 요청을 보호합니다. 운영 단계에서는 Supabase Auth 기반 관리자 권한 확인으로 강화하는 것을 권장합니다.

## GitHub Pages 배포

이 저장소는 GitHub Actions로 정적 사이트를 GitHub Pages에 배포하도록 설정되어 있습니다. `main`, `master`, 또는 `work` 브랜치에 푸시하면 `.github/workflows/pages.yml` 워크플로가 실행되어 `site/` 폴더만 GitHub Pages artifact로 업로드해 호스팅합니다.

배포 후 GitHub 저장소의 **Settings → Pages**에서 Source를 **GitHub Actions**로 설정하면 공개 URL에서 요뜨 MVP를 확인할 수 있습니다. 일반적인 프로젝트 페이지 주소는 다음 형식입니다.

```text
https://<github-username>.github.io/<repository-name>/
```
