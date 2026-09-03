# ⚪⚫ WebMCP Real-time AI Omok (Gomoku)

인간과 AI가 실시간으로 상호작용하는 **WebMCP 기반 실시간 오목 대전 게임**입니다.

## 🌟 핵심 특징

- **W3C/Chrome WebMCP 규격 준수**: `document.modelContext.registerTool` 인터페이스 적용
- **실시간 양방향 WebSocket 통신**: 사람이 웹 브라우저에서 돌을 두면, AI 에이전트가 최선의 수를 수읽기하여 WebMCP `place_stone` 도구를 호출해 착수합니다.
- **모바일 반응형 지원**: PC 및 스마트폰 터치 인터페이스 완벽 지원

## 🚀 실행 방법

```bash
npm install
npm start
```

브라우저에서 `http://localhost:8765`로 접속하여 대국을 시작합니다.
