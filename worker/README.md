# 무료 AI 프록시 배포 가이드

방문자가 API 키를 직접 넣지 않아도 AI 추천이 되게 하려면, 이 워커를 배포하고
`index.html`의 `AI_PROXY_URL` 상수에 배포된 주소를 넣으면 됩니다.

## 1. Gemini 무료 키 발급

1. https://aistudio.google.com/apikey 접속 → 구글 계정 로그인
2. "Create API key" 클릭 → 키 복사

## 2. Cloudflare Workers 배포

Cloudflare 계정이 필요합니다(무료 플랜으로 충분).

```bash
cd worker
npx wrangler login          # 브라우저로 Cloudflare 로그인
npx wrangler kv namespace create RATE_LIMIT
```

위 명령이 출력하는 `id`를 `wrangler.toml`의 `REPLACE_WITH_YOUR_KV_NAMESPACE_ID` 자리에 넣으세요.

```bash
npx wrangler secret put GEMINI_API_KEY
# 프롬프트가 뜨면 1번에서 복사한 키를 붙여넣기

npx wrangler deploy
```

배포가 끝나면 `https://mwohae-ai-proxy.<당신의-서브도메인>.workers.dev` 같은 주소가 출력됩니다.

## 3. index.html에 연결

`index.html`에서 `const AI_PROXY_URL = '';` 부분을 찾아서:

```js
const AI_PROXY_URL = 'https://mwohae-ai-proxy.<당신의-서브도메인>.workers.dev';
```

로 바꾸면, 방문자는 키 입력 없이 바로 AI 추천을 받습니다.

## 참고

- `DAILY_LIMIT`(worker.js 상단)으로 IP당 하루 요청 수를 제한합니다. 기본 30회.
  무료 Gemini 쿼터를 넘지 않도록 트래픽에 맞춰 조절하세요.
- 방문자가 자기 키를 직접 넣으면(설정 → AI 키) 그 키가 프록시보다 우선 사용됩니다.
- `GEMINI_API_KEY`는 항상 Cloudflare Secret으로만 보관되고, 브라우저로는 절대 전달되지 않습니다.
