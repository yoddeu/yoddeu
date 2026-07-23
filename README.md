# 요뜨(yoddeu)

요뜨는 **요즘 뜨는 것**의 줄임말입니다. 한국 인터넷에서 많이 언급되는 키워드를 카드형 랭킹으로 모아 보여주고, 각 키워드가 왜 뜨는지 짧게 설명하는 트렌드 큐레이션 MVP입니다.

## MVP 방향

- 한국 중심 트렌드
- 키워드 중심 탐색
- 카드형 랭킹 UI
- 일반 대중과 크리에이터 대상
- 초기에는 수동/반자동 큐레이션으로 빠르게 검증

## 실행 방법

정적 웹사이트이므로 별도 빌드 과정 없이 `index.html`을 브라우저에서 열 수 있습니다.

로컬 서버로 확인하려면 다음 명령을 사용합니다.

```bash
python3 -m http.server 4173
```

이후 브라우저에서 `http://127.0.0.1:4173/`에 접속합니다.

## GitHub Pages 배포

이 저장소는 GitHub Actions로 정적 사이트를 GitHub Pages에 배포하도록 설정되어 있습니다. `main`, `master`, 또는 `work` 브랜치에 푸시하면 `.github/workflows/pages.yml` 워크플로가 실행되어 저장소 루트의 `index.html`을 바로 호스팅합니다.

배포 후 GitHub 저장소의 **Settings → Pages**에서 Source를 **GitHub Actions**로 설정하면 공개 URL에서 요뜨 MVP를 확인할 수 있습니다. 일반적인 프로젝트 페이지 주소는 다음 형식입니다.

```text
https://<github-username>.github.io/<repository-name>/
```
