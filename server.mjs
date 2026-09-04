import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = 8765;
const HTML_FILE = path.join(process.cwd(), 'omok', 'index.html');

let savedApiKey = process.env.GEMINI_API_KEY || '';

// -------------------------------------------------------------
// Google Gemini API 호출 함수 (Webhook ➔ Gemini 2.0)
// -------------------------------------------------------------
async function callGeminiForOmok(board, moveHistory, apiKey) {
  const key = apiKey || savedApiKey;
  if (!key) {
    throw new Error('API 키가 설정되지 않았습니다.');
  }

  const lastMove = moveHistory[moveHistory.length - 1];
  const colLetter = String.fromCharCode(65 + lastMove.x);
  const rowNum = 15 - lastMove.y;

  // 바둑판 시각화 텍스트 생성
  let boardStr = '   A B C D E F G H I J K L M N O\n';
  for (let y = 0; y < 15; y++) {
    const r = (15 - y).toString().padStart(2, ' ');
    const line = board[y].map(v => (v === 0 ? '·' : v === 1 ? '●' : '○')).join(' ');
    boardStr += `${r} ${line}\n`;
  }

  const prompt = `현재 15x15 오목판 상태:
${boardStr}

●: 흑돌 (상대방 사용자)
○: 백돌 (당신, Gemini)
·: 빈칸

상대방의 마지막 착수: ${colLetter}${rowNum} (x=${lastMove.x}, y=${lastMove.y})
최근 수순: ${JSON.stringify(moveHistory.slice(-8))}

오목 승리 규칙:
1. 연속 5목을 만들면 즉시 승리합니다.
2. 상대방의 열린 4목이나 3목은 반드시 막아야 합니다.
3. 이미 돌이 놓여 있는 곳(● 또는 ○)에는 절대 둘 수 없습니다. 반드시 '·'(빈칸, 값 0)인 곳의 좌표 (x, y)를 선택하세요. (x: 0~14, y: 0~14)

반드시 다음 JSON 형식으로만 응답하세요:
{
  "x": 0~14 사이의 정수 (빈칸 좌표),
  "y": 0~14 사이의 정수 (빈칸 좌표),
  "comment": "상대방의 노림수를 꿰뚫어보고 당신의 이번 수 전략을 설명하는 자연스러운 한국어 한마디",
  "emotion": "attack" | "defend" | "thinking" | "win" 중 하나
}`;

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;

  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: 0.1
      }
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API 오류 (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini 응답 텍스트 없음');

  const parsed = JSON.parse(text);

  // 안전 검사: 만약 이미 돌이 놓인 곳을 골랐다면 인근 빈칸으로 자동 보정
  if (board[parsed.y][parsed.x] !== 0) {
    console.warn(`[Gemini 경고] ${parsed.x}, ${parsed.y}에 이미 돌이 있습니다. 인근 빈칸을 탐색합니다.`);
    const fallback = findNeighborEmpty(board, lastMove.x, lastMove.y);
    parsed.x = fallback.x;
    parsed.y = fallback.y;
  }

  return parsed;
}

function findNeighborEmpty(board, cx, cy) {
  for (let dist = 1; dist < 5; dist++) {
    for (let dy = -dist; dy <= dist; dy++) {
      for (let dx = -dist; dx <= dist; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && nx < 15 && ny >= 0 && ny < 15 && board[ny][nx] === 0) {
          return { x: nx, y: ny };
        }
      }
    }
  }
  return { x: 7, y: 7 };
}

// -------------------------------------------------------------
// HTTP & WebSocket 서버
// -------------------------------------------------------------
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/' || req.url === '/index.html') {
    const html = fs.readFileSync(HTML_FILE, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('[대국실] 🟢 사용자 연결 완료');

  ws.on('message', async (raw) => {
    try {
      const data = JSON.parse(raw);

      if (data.type === 'SET_API_KEY') {
        savedApiKey = data.apiKey;
        console.log('[API 키 설정] Gemini API 키가 브라우저로부터 등록되었습니다.');
        return;
      }

      // 🚀 Webhook 착수 이벤트 수신!
      if (data.type === 'WEBHOOK_MOVE') {
        const { x, y, board, moveHistory, apiKey } = data;
        const colLetter = String.fromCharCode(65 + x);
        const rowNum = 15 - y;

        console.log(`\n======================================================`);
        console.log(`🔔 [Webhook 수신] 사용자 착수: ${colLetter}${rowNum} (${x}, ${y})`);
        console.log(`✨ Google Gemini 2.0 Flash로 수읽기 요청 전송 중...`);

        const keyToUse = apiKey || savedApiKey;
        if (!keyToUse) {
          console.log('⚠️ API 키 누락: 사용자에게 키 입력을 요청합니다.');
          ws.send(JSON.stringify({
            tool: 'post_ai_comment',
            args: {
              message: '🔑 상단의 Gemini API Key 입력창에 키를 입력하고 [키 저장]을 눌러주세요! 그러면 제가 즉시 수읽기를 하고 착수합니다.',
              emotion: 'thinking'
            }
          }));
          return;
        }

        try {
          // 진짜 Google Gemini 2.0 호출!
          const decision = await callGeminiForOmok(board, moveHistory, keyToUse);
          const aiCol = String.fromCharCode(65 + decision.x);
          const aiRow = 15 - decision.y;

          console.log(`>>> ✨ [Gemini 응답 수신!]`);
          console.log(`    착수 좌표: ${aiCol}${aiRow} (${decision.x}, ${decision.y})`);
          console.log(`    감정 상태: ${decision.emotion}`);
          console.log(`    해설 멘트: "${decision.comment}"`);
          console.log(`======================================================\n`);

          // 브라우저로 WebMCP place_stone 도구 호출 전송!
          ws.send(JSON.stringify({
            tool: 'place_stone',
            args: {
              x: decision.x,
              y: decision.y,
              color: 'white',
              comment: decision.comment,
              emotion: decision.emotion
            }
          }));

        } catch (apiErr) {
          console.error('Gemini API 호출 실패:', apiErr.message);
          ws.send(JSON.stringify({
            tool: 'post_ai_comment',
            args: {
              message: `⚠️ Gemini API 호출 오류: ${apiErr.message}`,
              emotion: 'thinking'
            }
          }));
        }
      }
    } catch (e) {
      console.error('메시지 처리 오류:', e);
    }
  });

  ws.on('close', () => {
    console.log('[대국실] 🔴 사용자 퇴장');
  });
});

server.listen(PORT, () => {
  console.log(`[WebMCP × Gemini 오목 서버] 🚀 준비 완료: http://localhost:${PORT}`);
});
