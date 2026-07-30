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

## 4. 와이어가 실제로 이 둘을 싣는가 — 판정 완료

**안 싣는다. 단 "예약어"가 아니라 "제거된 기능"이다.** (2026-07-30, `eureka-flows-api`
`develop @ 1efa791` = v0.26.621d 직독)

> **앞선 서술 정정.** 이 절은 원래 "노드 실행 state를 계산하는 코드가 eureka-flows-api에
> 없어서 판정 불가"라고 적었다. **틀렸다** — 그 코드가 거기 있다. 설치된 npm 패키지
> (`@lemoncloud/eureka-flows-api`)만 보면 `.d.ts`뿐이라 안 보이지만, 서버 소스 레포를 보면
> 나온다. 아래는 소스 레포 기준.

### 오늘 와이어의 state 어휘 = `{READY, RUNNING, COMPLETED, ERROR}`

소켓 노드 프레임을 만드는 곳은 **하나뿐**이다 — `transformer-graph.ts:1546`
`asSocketNodeEvent`. state는 `:1566-1574`의 5분기 삼항이 전부:

```ts
const state: NodeStatus = node?.error
    ? 'ERROR'
    : stage === null
      ? ''
      : !stage
        ? 'READY'
        : stage == 'final'
          ? 'COMPLETED'
          : 'RUNNING';
```

- `options.state` override(`:1580`)가 열려 있지만 **호출부가 전 레포에 하나**
  (`proxy-graph.ts:286` `_node()`)고 `{ no, stage, $run }`만 넘긴다
- 발신 지점도 그 하나다. `wss-proxy.ts:275`가 손수 만드는 `type:'node'`는
  `{ type:'node', ...$node, ...data }` 래퍼이고 `data`가 위 이벤트다 — 독립 어휘 소스 아님
- **`''`는 도달 불가**: `stage === null`이 필요한데 `RunNodeStage`
  (`types-graph.ts:243`)에 `null`이 없고 유일 호출부도 타입을 지킨다. `stage === ''`는
  falsy라 `'READY'`로 간다
- REST·영속 경로도 못 만든다: `asState`/`asStatus`(`:643,663`)는 `ERROR | READY | def`이고
  `def` 실인자는 `'IDLE'`·`'READY'`·`undefined`뿐. `toNodeStatus`(`:944`)는 **호출부 0개**

**→ 엔진 유니온 5개가 오늘 와이어와 정확히 일치한다.** §1의 "계약 8 vs 엔진 5"는
정확히는 **선언 8 vs 도달가능 5**다.

### 하지만 한때 실렸다 — `disabled` 노드가 SKIPPED였다

전 ref를 훑으면 LUT 밖 `SKIPPED`/`WAITING` 할당을 가진 브랜치들
(`origin/feat/graph-rag`, `origin/feat/opt-text-block`, `feat/refactoring`,
`feat/add-flow-model`)이 전부 develop의 **조상**이다(`develop...graph-rag` = `735 0`).
히스토리에 들어왔다가 지워졌다는 뜻이다.

- 도입 `e28ee89` (2026-01-26) → 최대 5건 (`1a621ac`, 2026-02-13)
- **삭제 `b2093a9` "v0.26.227a cleanup"** (2026-02-28) — `proxy.ts` −898줄 포함 총 −1740줄.
  proxy → proxy-graph V2 이행의 일부

지워진 코드가 하던 일은 LUT 주석이 말하는 "조건 분기"가 아니라 **`disabled` 노드**였다:

```ts
if ($current?.disabled) {
    await this.setStatusAndFlush(nodeId, 'SKIPPED');
    return $current;
}
```

develop에는 `disabled` 노드 처리가 **통째로 없다**(`proxy.ts`·`proxy-graph.ts`·
`service-graph.ts` 0건, 프론트 엔진도 0건). 기능이 빠지면서 state도 같이 나갔다.
`GuardResult.nextState?: NodeStatusType`(`types-graph.ts:381-387`)은 선언만 남고 사용처 0 —
같은 계열의 잔해다.

> **flow-mcp 근거 정정은 유효하다.** "서버가 `SKIPPED`를 보낸다"의 근거가 자기
> `TERMINAL_STATES`였던 건 맞고, 그건 관측이 아니라 방어적 가정이었다
> (`TERMINAL_STATES` 도입 커밋 = `e95a33d "chore: temp commit"`, 테스트도 합성 fixture).
> **다만 그 방어를 지우라는 결론으로 가면 안 된다** — 타입 계약이 여전히 예약하고 있고,
> 제거된 기능이 돌아오면 필요하다.

이게 왜 계획을 바꾸는가: 유니온 확장은 **죽은 코드가 아니라 회귀한 기능의 선작업**이다.
그래서 **취소가 아니라 보류**다.

**미검증 1건**: 배포된 프로덕션 버전이 이 소스와 같은지는 확인 못 했다(로컬 develop
0.26.621d, 이 레포가 설치한 타입 패키지 0.26.609). 제거가 2026-02-28이고 이후 develop에
재도입 흔적이 0이라 뒤집힐 가능성은 낮다.

## 5. 소비자별 노출도

| 소비자                      | 미모델링 state를 만나면                                     | 지금            |
| --------------------------- | ----------------------------------------------------------- | --------------- |
| **flow-mcp** (`ws-client`)  | `RANK_AS` + 미랭크 last-write                               | 보정 있음, 국소 |
| **브라우저 에디터**         | 소켓 경로도 로드 경로도 값을 버린다 — 노드가 안 움직인다    | 보정 없음       |
| **CLI** (`libs/engine/cli`) | 같은 파서 + `isTerminal`이 둘뿐 → `waitForNode`가 안 깨어남 | 보정 없음       |

**브라우저·CLI 행은 확인함** (2026-07-30, 1차 출처 직독):

- 소켓 → `dispatchSocketFrame.ts:1`이 엔진의 `parseSocketFrame`을 쓴다. state가 지워진 채
  오므로 `useSocketHandlers`/`useMobileSocketSync`(`:121-127`)의 `if (state)`가 통째로 건너뛴다.
  둘 다 `state as NodeState` 캐스팅을 하지만 **이미 필터를 통과한 값**이라 raw가 새지는 않는다
- 로드·폴링 → `WorkflowCanvas.tsx:884`의 `getEffectiveState`가 자기 화이트리스트
  (`libs/flows/src/consts/status.ts:6` — 엔진과 별개인 두 번째 5개 목록)로 다시 버린다
- 합치면: 미지 state를 받은 노드는 **직전 state로 남는다.** 실행 중이었다면 60초 폴백 폴링
  (`EXECUTION_FALLBACK_TIMEOUT_MS`)이 가져온 값도 같은 자리에서 지워져 **RUNNING인 채로 계속 돈다**
- CLI/`runSession`은 여기에 하나 더 — 터미널 판정이 `runSession.ts:58`·`executionReducer.ts:83`에
  `COMPLETED | ERROR`로 박혀 있어, 설령 state가 살아 들어와도 `waitForNode`는 settle되지 않는다

flow-mcp만 덧댔다. 같은 리듀서를 쓰는 다른 소비자는 **같은 갭을 그대로 맞는다** — 정본을
엔진에서 고쳐야 하는 이유. 소비자마다 `RANK_AS`를 복제하면 손으로 짠 규칙이 셋이 된다.

---

## 한 줄 요약

계약은 8개, 엔진은 5개를 안다. 미지의 state는 파싱에서 값이 지워지고(`state: undefined`)
우선순위에서 `-1`을 받아 **못 들어오면서 동시에 밀려나기 쉬운** 상태가 된다. flow-mcp는
밖에서 덧댔고 나머지 소비자는 안 덧댔다. **단 와이어가 정말 그 state를 싣는지는 아직
확인 안 됐다** — 그것부터 판정해야 고칠 방향이 정해진다.
