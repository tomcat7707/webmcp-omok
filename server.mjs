import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = 8765;
const HTML_FILE = path.join(process.cwd(), 'omok', 'index.html');

let connectedSockets = new Set();
let pendingResolvers = new Map();
let requestId = 0;
let latestGameState = {
  board: Array(15).fill(0).map(() => Array(15).fill(0)),
  moveHistory: [],
  lastMove: null
};

// 도구 원격 호출 헬퍼
function callWebMCPTool(ws, toolName, args = {}) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return reject(new Error('브라우저와 연결되어 있지 않습니다.'));
    }
    const id = ++requestId;
    const msg = JSON.stringify({ reqId: id, tool: toolName, args });
    
    const timeout = setTimeout(() => {
      pendingResolvers.delete(id);
      reject(new Error(`도구 ${toolName} 실행 시간 초과`));
    }, 5000);

    pendingResolvers.set(id, (resp) => {
      clearTimeout(timeout);
      resolve(resp);
    });

    ws.send(msg);
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. 웹페이지 서빙
  if (req.url === '/' || req.url === '/index.html') {
    const html = fs.readFileSync(HTML_FILE, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // 2. 현재 바둑판 상태 조회 API (Antigravity가 조회)
  if (req.url === '/api/board' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(latestGameState));
    return;
  }

  // 3. Antigravity AI가 WebMCP 도구를 직접 호출하는 API
  if (req.url === '/api/action' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { tool, args } = JSON.parse(body);
        const ws = Array.from(connectedSockets)[0];
        if (!ws) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({ error: '브라우저 탭이 연결되어 있지 않습니다.' }));
        }

        const result = await callWebMCPTool(ws, tool, args);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, result }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  connectedSockets.add(ws);
  console.log(`[오목 대국실] 🟢 브라우저 대국자 입장 (현재 연결: ${connectedSockets.size})`);

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw);

      // 도구 실행 응답
      if (data.type === 'tool_response' && data.reqId && pendingResolvers.has(data.reqId)) {
        const resolver = pendingResolvers.get(data.reqId);
        pendingResolvers.delete(data.reqId);
        resolver(data.result);
      }
      // 사람이 돌을 둔 이벤트
      else if (data.type === 'USER_MOVED') {
        const colLetter = String.fromCharCode(65 + data.x);
        const rowNum = 15 - data.y;
        latestGameState = {
          board: data.board,
          moveHistory: data.moveHistory,
          lastMove: { x: data.x, y: data.y, coord: `${colLetter}${rowNum}` }
        };

        console.log(`\n======================================================`);
        console.log(`👤 [사람 착수 알림] ${colLetter}${rowNum} (${data.x}, ${data.y})에 흑돌 착수!`);
        console.log(`총 수수: ${data.moveHistory.length}수 | Antigravity AI의 착수 명령을 대기 중입니다...`);
        console.log(`======================================================\n`);
      }
    } catch (e) {
      console.error('메시지 처리 오류:', e);
    }
  });

  ws.on('close', () => {
    connectedSockets.delete(ws);
    console.log(`[오목 대국실] 🔴 브라우저 대국자 퇴장`);
  });
});

server.listen(PORT, () => {
  console.log(`[WebMCP 오목 순수 브릿지 서버] 🚀 준비 완료: http://localhost:${PORT}`);
});
