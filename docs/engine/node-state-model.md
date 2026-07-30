# 노드 실행 state 모델 — 세 계층

작성 2026-07-30 · 이 문서는 **지금 사실이 어떤지**만 적는다. 무엇을 고칠지는
[`PLAN-node-state-completion.md`](./PLAN-node-state-completion.md).

정본 3개(`GUIDE.md`·`DESIGN.md`·`PLAN.md`)의 위성 문서다. `PLAN.md` §15로 접힌 뒤에는
이 파일이 그 절의 배경 자료가 된다.

전부 1차 출처 직독. 각 사실에 `파일:줄`을 붙였다 — 옮겨 적은 게 아니라 그 줄을 봤다는 뜻.

---

## 1. 계약 — 서버 API 패키지가 선언하는 것

`@lemoncloud/eureka-flows-api` · `src/modules/flows/types-graph.ts:163-172`

```ts
NodeStatusType: {
    '': '',                  // empty
    IDLE: 'idle',
    WAITING: 'waiting',      // 필수 입력 대기 중
    READY: 'ready',          // 모든 필수 입력 준비됨 (실행 가능)
    RUNNING: 'running',
    COMPLETED: 'completed',
    ERROR: 'error',
    SKIPPED: 'skipped',      // 조건 분기에 의해 실행되지 않음
}
```

**멤버 8개.** TS 타입은 값이 아니라 **키**다:

```ts
// types-graph.d.ts:230
export declare type NodeStatusType = keyof typeof $LUT.NodeStatusType;
```

→ 와이어에 실리는 건 **대문자** (`'RUNNING'`, `'SKIPPED'`). 소문자 `'running'`은 LUT 값이고
프레임에는 안 나온다. 이 구분이 중요한 이유: 엔진의 Set도 대문자라 **케이싱은 맞고 목록만
짧다.** 마이그레이션이 아니라 누락 보충이다.

`''`도 정식 멤버 — "state 없음"을 뜻하는 빈 문자열.

## 2. 엔진이 모델링하는 것

`@lemoncloud/flow-engine@0.1.0` published bundle 직독 (소스가 아니라 배포물 — 소비자가 보는 것)

```ts
// build/types.d.ts:15
export type NodeState = 'IDLE' | 'READY' | 'RUNNING' | 'COMPLETED' | 'ERROR';
```

```js
// build/index.cjs
var NODE_STATES = new Set(['IDLE', 'READY', 'RUNNING', 'COMPLETED', 'ERROR']);
var STATE_PRIORITY = { IDLE: 0, READY: 1, RUNNING: 2, COMPLETED: 3, ERROR: 4 };
priority = state => STATE_PRIORITY[state ?? ''] ?? -1;
shouldUpdateState = (current, server) => priority(server) >= priority(current);
```

**5개.** 빠진 것 3개: `''`, `WAITING`, `SKIPPED`.

소스에 인지 흔적 한 줄 있다 — 모델링은 안 됨:

```ts
// libs/engine/src/types.ts:17
* @note API package's NodeStatusType also includes WAITING and SKIPPED.
```

`docs/engine/` 정본 3개에는 언급 **0건**. 결정으로 기록된 게 아니라 주석으로만 남았다.

## 3. 미모델링 state가 파이프라인을 지날 때

### 3-1. 파싱에서 값이 지워진다

```js
// build/index.cjs — parseSocketFrame
state: isNodeState(str(payload["state"]) ?? "") ? payload["state"] : void 0,
```

`isNodeState('SKIPPED')` → false → **`state: undefined`**. 프레임의 나머지(`no`, `flowId`,
`runId`, `stage`, `progress`)는 살아남고 state만 없어진다. 리듀서는 "state 없는 노드 이벤트"를
본다 — 프레임이 버려지는 게 아니라 **의미만 비는 것**이라 더 조용하다.

### 3-2. 우선순위가 양방향으로 틀린다

`priority()`가 미등록 state에 `-1`을 주고, `shouldUpdateState`는 `>=` 비교다:

| 상황                                 | 계산                               | 결과                        |
| ------------------------------------ | ---------------------------------- | --------------------------- |
| `next = SKIPPED` (current `RUNNING`) | `-1 >= 2` → false                  | **프레임 버려짐**           |
| `current = SKIPPED` (next 아무거나)  | `priority(next) >= -1` → 항상 true | **skipped 노드가 되돌려짐** |

한 state가 "절대 못 들어오는데, 들어와 있으면 아무거나 밀어낼 수 있는" 최악 조합이 된다.
`''`도 같은 함정을 밟지만 `''`는 의미상 "state 없음"이라 드롭이 오히려 맞다 — **`''`는
누락이 아니라 의도된 배제로 봐야 한다.**

### 3-3. flow-mcp가 밖에서 덧대고 있다

`@lemoncloud/flow-mcp@1.7.0` · `src/ws-client.ts` — 엔진 규칙 채택(PR #12) 때 넣은 우회:

```ts
const RANKED_STATES = new Set(['IDLE', 'READY', 'RUNNING', 'COMPLETED', 'ERROR']);
const RANK_AS: Record<string, string> = { SKIPPED: 'COMPLETED' };

const acceptsState = (current, next) => {
    if (current === undefined) return true;
    const from = RANK_AS[current] ?? current;
    const to = RANK_AS[next] ?? next;
    if (!RANKED_STATES.has(from) || !RANKED_STATES.has(to)) return true; // 미랭크 → last-write
    return shouldUpdateState(from, to);
};
```

`SKIPPED`를 `COMPLETED` 티어로 올려 3-2를 막고, **그 외 미랭크 state는 last-write로 흘린다**
(엔진 도입 전 동작 보존 — 조용히 드롭하는 것보다 낫다는 판단). 파싱이 state를 지우므로
원본 메시지에서 따로 긁는 함수도 필요하다:

```ts
const rawStateOf = (msg: unknown): string | undefined => {
    /* msg.data.state */
};
```

`TERMINAL_STATES = {COMPLETED, ERROR, SKIPPED}` (`src/types.ts:232`) 가 완료 판정에 쓰인다.
**`WAITING`은 거기 없다** → flow-mcp에서 `WAITING`은 미랭크 last-write 경로로 흐른다.

## 4. ⚠️ 확인 못 한 것 — 와이어가 실제로 이 둘을 싣는가

**eureka-flows-api 런타임 코드에 `SKIPPED`/`WAITING` 할당이 없다.** `git grep`으로 확인한
전체 출현:

- `SKIPPED` → `types-graph.ts:171` (LUT 선언) · `src/modules/flows/README.md:119` (설명 표). 끝.
- `WAITING` → 런타임 0건.

노드 실행 state를 계산하는 코드가 그 레포에 없다 (`api-flows.ts`/`proxy-graph.ts`는 저장·프록시,
`wss-proxy.ts`는 소켓 중계). 실행 주체는 다른 서비스거나 브라우저다 — **eureka-flows-api와
flow-mcp 두 레포만으로는 판정 불가.**

> **선행 정정.** "서버가 `SKIPPED`를 보낸다"는 서술이 flow-mcp 쪽 판단 근거로 쓰였는데,
> 그 근거는 flow-mcp의 `TERMINAL_STATES`에 그게 있다는 것이었다 — **방어적 가정이지 확인된
> 서버 동작이 아니다.** 계약에 선언돼 있는 건 사실, 와이어에 실린다는 건 미확인.
> PLAN의 슬라이스 0이 이걸 판정한다.

이게 왜 계획을 바꾸는가: 와이어가 절대 안 싣는다면 "유니온에 추가"는 죽은 코드를 늘리는
것이고, 올바른 수정은 **선언에서 빼거나 reserved로 명시**하는 쪽이다.

## 5. 소비자별 노출도

| 소비자                      | 미모델링 state를 만나면          | 지금                  |
| --------------------------- | -------------------------------- | --------------------- |
| **flow-mcp** (`ws-client`)  | `RANK_AS` + 미랭크 last-write    | 보정 있음, 국소       |
| **브라우저 에디터**         | 미확인 — 같은 리듀서를 직접 쓴다 | 보정 없음 (확인 필요) |
| **CLI** (`libs/engine/cli`) | 미확인 — 같은 리듀서             | 보정 없음 (확인 필요) |

flow-mcp만 덧댔다. 같은 리듀서를 쓰는 다른 소비자는 **같은 갭을 그대로 맞는다** — 정본을
엔진에서 고쳐야 하는 이유. 소비자마다 `RANK_AS`를 복제하면 손으로 짠 규칙이 셋이 된다.

---

## 한 줄 요약

계약은 8개, 엔진은 5개를 안다. 미지의 state는 파싱에서 값이 지워지고(`state: undefined`)
우선순위에서 `-1`을 받아 **못 들어오면서 동시에 밀려나기 쉬운** 상태가 된다. flow-mcp는
밖에서 덧댔고 나머지 소비자는 안 덧댔다. **단 와이어가 정말 그 state를 싣는지는 아직
확인 안 됐다** — 그것부터 판정해야 고칠 방향이 정해진다.
