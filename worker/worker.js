// 뭐하지 앱용 무료 AI 프록시.
// 역할: 방문자가 API 키를 넣지 않아도, 배포자가 등록해둔 Gemini 키로 대신 호출해준다.
// 절대 GEMINI_API_KEY를 클라이언트로 내려보내지 않는다 — 서버(워커)에서만 사용한다.

const DAILY_LIMIT = 30; // IP당 하루 요청 한도. 무료 Gemini 쿼터를 다 같이 나눠 쓰기 위한 안전장치.
const ALLOWED_ORIGIN = '*'; // 특정 도메인에서만 쓰게 하려면 예: 'https://내아이디.github.io'

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }
    if (request.method !== 'POST') {
      return json({ error: 'POST만 허용됩니다' }, 405, cors);
    }

    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      return json({ error: '잘못된 요청 형식' }, 400, cors);
    }

    const { system, userMsg } = payload || {};
    if (!system || !userMsg) {
      return json({ error: 'system, userMsg가 필요합니다' }, 400, cors);
    }

    // ---- 요청 제한 (KV 바인딩 이름: RATE_LIMIT) ----
    if (env.RATE_LIMIT) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const today = new Date().toISOString().slice(0, 10);
      const rlKey = `rl:${ip}:${today}`;
      const current = parseInt((await env.RATE_LIMIT.get(rlKey)) || '0', 10);
      if (current >= DAILY_LIMIT) {
        return json({ error: '오늘 무료 사용량을 다 썼어요. 내일 다시 시도해주세요.' }, 429, cors);
      }
      await env.RATE_LIMIT.put(rlKey, String(current + 1), { expirationTtl: 60 * 60 * 24 });
    }

    if (!env.GEMINI_API_KEY) {
      return json({ error: '서버에 GEMINI_API_KEY가 설정되어 있지 않습니다' }, 500, cors);
    }

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: userMsg }] }],
            generationConfig: { temperature: 1, maxOutputTokens: 1200 }
          })
        }
      );
      const data = await res.json();
      if (data.error) {
        return json({ error: data.error.message || 'Gemini API 오류' }, 502, cors);
      }
      const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('\n');
      return json({ text }, 200, cors);
    } catch (e) {
      return json({ error: 'AI 호출 실패: ' + e.message }, 502, cors);
    }
  }
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors }
  });
}
