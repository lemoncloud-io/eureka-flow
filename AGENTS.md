# AGENTS.md

도구 중립 에이전트 컨텍스트 (Cursor / Copilot / Claude 공통 진입점).
(포인터 모드 — 정본화는 `/agents-sync` 전면 실행 시. 그때 이 포인터 줄들은 보존.)

- 코딩 규칙·빌드 명령·아키텍처: [CLAUDE.md](./CLAUDE.md) 참조 (정본 — 여기 중복하지 않음).
- 엔진 설계·실행 계획: `docs/engine/DESIGN.md` (근거·아키텍처) · `docs/engine/PLAN.md` (실행 명세 — Phase 0–4, 불변식, 확정 API).
- 도메인 배경·결정 이력: knowledge vault (`lemoncloud-io/knowledge` repo) — `projects/@lemoncloud-io/eureka-flow/` + related wiki (`flow-blackbox-model`, `transact-history-pattern`).
