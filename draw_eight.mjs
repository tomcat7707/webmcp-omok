const delay = ms => new Promise(r => setTimeout(r, ms));

async function callTool(tool, args) {
  const res = await fetch('http://localhost:8765/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, args })
  });
  return await res.json();
}

async function main() {
  // 1. 바둑판 리셋
  await callTool('reset_game', {});
  await delay(200);

  // 2. AI 코멘트 게시
  await callTool('post_ai_comment', {
    message: "오목판에 백돌로 숫자 '8'을 멋지게 그려보겠습니다! WebMCP 픽셀 드로잉 시작!",
    emotion: 'attack'
  });
  await delay(300);

  // 숫자 8 좌표 목록 (15x15 중앙 대칭)
  const coords = [
    // 1. 상단 원
    { x: 6, y: 3 }, { x: 7, y: 3 }, { x: 8, y: 3 },
    { x: 9, y: 4 }, { x: 9, y: 5 },
    { x: 8, y: 6 }, { x: 7, y: 6 }, { x: 6, y: 6 },
    { x: 5, y: 5 }, { x: 5, y: 4 },

    // 2. 하단 원
    { x: 9, y: 7 }, { x: 9, y: 8 }, { x: 9, y: 9 },
    { x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 },
    { x: 5, y: 9 }, { x: 5, y: 8 }, { x: 5, y: 7 }
  ];

  for (let i = 0; i < coords.length; i++) {
    const pt = coords[i];
    await callTool('place_stone', { x: pt.x, y: pt.y, color: 'white' });
    await delay(120); // 딱! 딱! 소리와 함께 그려지는 애니메이션 효과
  }

  await callTool('post_ai_comment', {
    message: "짜잔! 백돌 19개로 오목판 정중앙에 완벽한 숫자 '8'을 완성했습니다! 어떠신가요? 😊",
    emotion: 'win'
  });

  console.log("숫자 8 드로잉 완료!");
}

main().catch(console.error);
