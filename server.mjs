import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = 8765;
const HTML_FILE = path.join(process.cwd(), 'omok', 'index.html');
const BOARD_SIZE = 15;

const delay = ms => new Promise(r => setTimeout(r, ms));

// -------------------------------------------------------------
// AI 오목 수읽기 엔진 (Gomoku Evaluation Engine)
// -------------------------------------------------------------
function evaluatePoint(board, x, y, myColor, oppColor) {
  let myScore = 0;
  let oppScore = 0;

  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];

  for (const [dx, dy] of dirs) {
    // 1. 내 공격 점수 계산
    myScore += countPattern(board, x, y, dx, dy, myColor, oppColor);
    // 2. 상대 방어 점수 계산 (상대가 여기에 두면 얼마나 위협적인가?)
    oppScore += countPattern(board, x, y, dx, dy, oppColor, myColor);
  }

  // 중심 가중치 (중심 7,7에 가까울수록 유리)
  const centerDist = Math.abs(x - 7) + Math.abs(y - 7);
  const centerBonus = Math.max(0, 14 - centerDist);

  // 방어가 공격보다 약간 더 시급할 때가 많으므로 상대 점수에 가중치
  return myScore * 1.1 + oppScore + centerBonus;
}

function countPattern(board, x, y, dx, dy, color, enemyColor) {
  let count = 1;
  let openEnds = 0;

  // 정방향 탐색
  let step = 1;
  while (step < 5) {
    const nx = x + dx * step;
    const ny = y + dy * step;
    if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) break;
    if (board[ny][nx] === color) {
      count++;
      step++;
    } else if (board[ny][nx] === 0) {
      openEnds++;
      break;
    } else {
      break; // 상대 돌에 막힘
    }
  }

  // 역방향 탐색
  step = 1;
  while (step < 5) {
    const nx = x - dx * step;
    const ny = y - dy * step;
    if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) break;
    if (board[ny][nx] === color) {
      count++;
      step++;
    } else if (board[ny][nx] === 0) {
      openEnds++;
      break;
    } else {
      break;
    }
  }

  // 점수 부여 테이블
  if (count >= 5) return 200000; // 5목 완성 (승리 확정)
  if (count === 4) {
    if (openEnds === 2) return 80000; // 열린 4 (거의 필승)
    if (openEnds === 1) return 15000; // 닫힌 4 (방어/공격 필수)
  }
  if (count === 3) {
    if (openEnds === 2) return 8000; // 열린 3 (매우 강력)
    if (openEnds === 1) return 1000; // 닫힌 3
  }
  if (count === 2) {
    if (openEnds === 2) return 500;
    if (openEnds === 1) return 100;
  }
  return 10;
}

function findBestMove(board) {
  let bestScore = -1;
  let bestMoves = [];

  // 모든 빈칸 평가
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (board[y][x] === 0) {
        // 주변 2칸 이내에 돌이 있는 위치만 평가 (연산 최적화)
        let hasNeighbor = false;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board[ny][nx] !== 0) {
              hasNeighbor = true;
              break;
            }
          }
          if (hasNeighbor) break;
        }

        // 첫 수거나 주변에 돌이 있는 경우
        if (hasNeighbor || (x === 7 && y === 7)) {
          const score = evaluatePoint(board, x, y, 2, 1); // 2: 백(AI), 1: 흑(사람)
          if (score > bestScore) {
            bestScore = score;
            bestMoves = [{ x, y, score }];
          } else if (score === bestScore) {
            bestMoves.push({ x, y, score });
          }
        }
      }
    }
  }

  // 동점일 경우 무작위 선택
  if (bestMoves.length > 0) {
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }
  return { x: 7, y: 7 };
}

// -------------------------------------------------------------
// 서버 및 실시간 WebMCP 핸들러
// -------------------------------------------------------------
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
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
  console.log('[오목 대전] 🟢 사용자가 오목 대국실에 입장했습니다.');

  ws.on('message', async (raw) => {
    try {
      const data = JSON.parse(raw);

      // 사람이 돌을 둔 경우 (PLAYER_MOVE 수신)
      if (data.type === 'PLAYER_MOVE') {
        const colLetter = String.fromCharCode(65 + data.x);
        const rowNum = 15 - data.y;
        console.log(`\n👤 [사람 착수] ${colLetter}${rowNum} (${data.x}, ${data.y})에 흑돌 착수!`);
        console.log('🤖 AI가 최선의 수를 수읽기 중입니다...');

        // 0.6초~0.9초 자연스러운 수읽기 딜레이
        await delay(700);

        // AI 최적의 수 계산
        const best = findBestMove(data.board);
        const aiCol = String.fromCharCode(65 + best.x);
        const aiRow = 15 - best.y;

        console.log(`>>> 🤖 [AI 착수 결정] WebMCP Tool place_stone(x: ${best.x}, y: ${best.y}) -> ${aiCol}${aiRow} 착수! (평가점수: ${Math.round(best.score)})`);

        // 브라우저로 WebMCP place_stone 도구 실행 명령 전송
        ws.send(JSON.stringify({
          tool: 'place_stone',
          args: { x: best.x, y: best.y, color: 'white' }
        }));
      }
    } catch (e) {
      console.error('메시지 처리 오류:', e);
    }
  });

  ws.on('close', () => {
    console.log('[오목 대전] 🔴 사용자가 퇴장했습니다.');
  });
});

server.listen(PORT, () => {
  console.log(`[WebMCP 오목 서버] 🚀 대국실 오픈: http://localhost:${PORT}`);
});
