# 그래프는 어디에 있나

`docs/flow-engine` 브랜치 기준. 한 장짜리 지도.

> **먼저**: 저장 위치는 **안 바뀌었다.** 서버 엔드포인트도, localStorage 키도, IndexedDB 도
> 그대로다. 바뀐 건 **메모리에서 누가 그래프를 소유하느냐**와 **로드 응답을 누가 정규화하느냐** 다.

---

## 계층

| 층                | 무엇                                                              | 어디                                                                                           | 무엇을 견디나     |
| ----------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------- |
| **엔진 document** | **소스 오브 트루스.** 편집·undo/redo·클립보드가 여기서만 일어난다 | `libs/engine/src/core/document.ts` (`createFlowEngine`)                                        | 아무것도 — 메모리 |
| `useCanvasStore`  | **단방향 투영.** 컴포넌트 수십 개가 여기서 읽는다                 | `libs/flows/src/stores/useCanvasStore.ts`                                                      | 아무것도 — 메모리 |
| `baseline`        | 서버가 **마지막으로 확인한** 그래프. dirty 판정의 기준선          | `useFlowsStore.baseline` (`FlowSnapshot`)                                                      | 아무것도 — 메모리 |
| 드래프트          | 저장 안 된 작업물                                                 | **IndexedDB** `eureka-flow` / `drafts` / key `'current'`                                       | 새로고침·탭 종료  |
| 세션 조각         | 열려 있던 flowId, 자동저장 on/off, 플로우별 뷰포트                | **localStorage** (`flows-current-flow-id`, `flows-auto-save-enabled`, `eureka-flow:viewports`) | 새로고침          |
| 서버              | 정본                                                              | `POST /flows/:id/save` · `GET /flows/:id/load`                                                 | 전부              |

### 규칙 하나

> **엔진에 쓰고, 스토어에서 읽는다.**

`useEngineMirror` (`apps/web/.../hooks/useEngineMirror.ts`) 가 `engine.subscribe` → `useCanvasStore.setState`
한 방향으로만 민다. 스토어를 읽어 엔진에 되쓰는 코드는 없다 — 그래서 둘이 서로 다르다고 다툴 수가 없다.

드래그 중에는 미러가 **멈춘다**(`paused`). 스토어가 커밋 안 된 프리뷰 좌표를 들고 엔진보다 앞서
있는 구간이라, 실행 중 소켓 메시지 하나가 노드를 커서 밑으로 되돌리는 걸 막는다.

### 엔진 인스턴스는 몇 개인가

에디터에는 **하나**다. `FlowEditorPage.tsx:81` 이 만들고 `:760` 에서 `engine={engine}` 로 캔버스에 넘긴다.
`WorkflowCanvas.tsx:261` 의 `engineProp ?? fallbackEngine` 은 캔버스가 **단독으로 렌더될 때**
(컴포넌트 뷰어 모달) 쓰는 폴백이지, 두 번째 에디터 엔진이 아니다.

---

## 경로

```
GET /flows/:id/load
  └─ engine.loadGraph(state, { ports })      ← 유일한 입구
       normalize: id 민팅 · config/position 채움 · 중복 엣지 제거
                  · 레거시 `connections` 필드 · 포트 값 병합 · 엣지 전파
  └─ setBaseline(...)                        ← dirty 의 기준

편집 (engine.transact)
  └─ history push → 미러 → useCanvasStore → 화면
  └─ (debounce) draftFor(graph) → IndexedDB      ← 저장 안 눌러도 살아남는 곳

POST /flows/:id/save
  body = toSnapshot(graph, blockRegistry)    ← **그래프 전체. patch 아니라 교체**
  └─ rebaseline(saveBody)
  └─ clearDraft()                            ← 서버가 가졌으니 로컬 사본 불필요
                                                (structureDropped 면 유지 — 그 작업은 아직 여기밖에 없다)
```

`loadGraph` 가 **단일 입구**인 게 이 브랜치의 핵심 변경 중 하나다. 전에는 캔버스가
`loadGraph` 를 부르기 **전에** 포트 병합·엣지 전파를 따로 했고, `repository`(헤드리스)는
그 두 패스를 못 받아서 같은 응답으로 다른 그래프를 만들었다.

### 저장되지 **않는** 것

실행 중 생기는 노드 state·포트 데이터는 `engine.applyRuntime` 으로 들어가고,
**history 에 안 쌓이며 `toSnapshot` 이 버린다.** 실행은 편집이 아니다 — 노드를 돌려도
undo 스택은 그대로고 다음 save 가 보낼 것도 안 생긴다.

포트 값 자체는 서버의 포트 레코드(`upsertPortNode`)에 따로 올라간다. 백엔드 노드가 읽는 게 그것.

---

## 들여다보기

| 하고 싶은 것          | 방법                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| 지금 캔버스가 든 JSON | 화면의 **GRAPH** 패널 (`DevGraphPanel`) — `flow / nodes / edges / baseline` 표시, Export/Import            |
| 브라우저 없이 전 구간 | `yarn engine:demo` — `load → add → undo → redo → save → run`                                               |
| 실서버에 붙여보기     | `FLOW_API_URL=… FLOW_API_KEY=… yarn engine:demo --real --flow <id>` (**기본 read-only**, 쓰려면 `--write`) |

---

## 어느 플랫폼에서 도나

엔진이 만지는 플랫폼 API 는 이게 전부다. 나머지는 순수 계산이다.

| 무엇                          | 어디                                               | 없으면                       |
| ----------------------------- | -------------------------------------------------- | ---------------------------- |
| `crypto.randomUUID()`         | `core/ids.ts`                                      | `configureIds(fn)` 로 주입   |
| `fetch`                       | `fetchHttpPort`                                    | `fetchFn` 옵션으로 주입      |
| `WebSocket`                   | `webSocketPort`                                    | `createSocket` 옵션으로 주입 |
| `AbortController`             | `fetchHttpPort` (타임아웃)                         | 전부 있다 — 아래 단서 하나   |
| `setTimeout` / `clearTimeout` | `runSession`, 어댑터                               | 전부 있다                    |
| `process.*`                   | **`cli/main.ts` 하나뿐** — 배럴에서 export 안 한다 | 해당 없음                    |

**`URL` 은 안 쓴다.** 예전엔 `fetchHttpPort` 가 `new URL(...)` + `searchParams.set` 으로
쿼리를 붙였는데, RN 의 `URL` shim 은 `searchParams` 가 없거나 불완전하다 — 하필 그게
쓰이던 부분이었다. 주입으로는 안 풀린다(돌려받는 객체 자체를 못 믿으므로). 그래서
`encodeURIComponent` 로 직접 조립한다 — ES 코어라 Hermes 포함 어디에나 있다.

> 인코딩이 딱 한 글자에서 갈린다: **공백**. `URLSearchParams` 는 `+`, 지금은 `%20`.
> 엔진이 보내는 쿼리에 공백은 없고, `%20` 이 URL 문맥에서 맞는 형태다. 스펙이 고정한다.

**`AbortController` 는 그대로 쓴다** — Node 16+, 모든 모던 브라우저, RN 0.60+ 에 있다.
`URL` 과 달리 부분 구현 문제가 없어서 씨앗(seam)을 만들 이유가 없다.

> 단, 타임아웃은 **`fetchFn` 이 `signal` 을 존중할 때만** 동작한다. 진짜 `fetch` 는 어디서든
> 존중하지만, `signal` 을 무시하는 커스텀 트랜스포트를 주입하면 30초 타임아웃이 조용히
> 무효가 되고 `repository.load()` 가 영원히 안 끝난다. 직접 트랜스포트를 넣을 거면 확인할 것.

`lib: ["ES2022"]` (DOM 없음) 컴파일이 **DOM API 를 안 쓴다**는 것까지 보증한다.
다만 `globalThis.crypto` 는 DOM lib 밖이라 컴파일러가 안 잡아준다 — 그래서 위 표가 있다.

**Node 22 / https·localhost 브라우저는 아무 설정도 필요 없다.**
`crypto.randomUUID` 가 없는 두 경우에만 부팅 시 한 번 호출한다:

```ts
import { configureIds } from '@flows/engine';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

configureIds(uuidv4); // React Native (Hermes 에는 crypto 가 없다)
```

- **React Native / Hermes** — `crypto` 자체가 없다.
- **plain http 브라우저** — `randomUUID` 는 **보안 컨텍스트(https·localhost)에만** 존재한다.
  사내 LAN IP 로 띄우면 `crypto` 는 있는데 이 메서드가 없다.

프로세스 단위다 — 엔진 인스턴스마다가 아니라. id 는 서버 키스페이스 하나로 들어가므로,
한 프로세스의 두 엔진이 서로 다른 소스에서 뽑는 건 기능이 아니라 버그다.
주입한 값도 대시가 벗겨진다 — `-` 는 서버가 포트 구분자로 rewrite 하는 문자라, 그냥
통과시키면 노드와 포트가 같은 행에 얹힌다.

> **"프로세스 단위" 의 예외 하나** — 주입 상태는 모듈 변수라, npm 패키지를 `import` 와
> `require` **양쪽으로** 들어가면 레지스트리가 둘 생기고 `configureIds` 는 한쪽만 바꾼다.
> 한 소비자가 두 진입점을 동시에 쓸 일은 드물어서 고치지 않았다 — 알고만 있으면 된다.

> **IndexedDB 는 엔진에 없다.** `draftStorage.ts` 는 `libs/flows`(브라우저) 소속이고,
> 엔진의 `persistence/draft.ts` 는 `draftFor()` 로 **드래프트 객체를 만들어 돌려줄 뿐**이다.
> 어디에 넣을지는 호스트가 정한다 — RN 이면 MMKV, Node 면 파일.

---

## Node 에서 직접 돌리기

브라우저·React·store 없이 그래프를 만들고 저장하고 실행할 수 있다.
`fetch` 와 `WebSocket` 은 Node 22 의 전역을 그대로 쓴다 — 브라우저 분기가 없다.

### 1. 준비된 데모부터

```bash
yarn engine:demo                                   # 스텁 서버, 네트워크 0
```

`load → add → undo → redo → save → run` 을 완주하고 마지막에 `OK` 또는 `FAILED` 를 찍는다
(실패면 exit 1 이라 CI 에 그대로 걸 수 있다).

```bash
FLOW_API_URL=https://…/_api_ FLOW_API_KEY=… \
FLOW_WS_URL=wss://…            \
  yarn engine:demo --real --flow 1007934
```

- **`--real` 은 기본 read-only** — load 에서 멈춘다. `--write` 로 add/save, `--write --run` 으로 실행.
  save 는 그래프 통째 교체라, 남의 플로우에 쓰면 되돌리기 어렵다.
- `FLOW_WS_URL` 이 없으면 소켓을 안 붙이고 run 단계도 건너뛴다.
- read-only 런은 **자기가 한 것만 주장한다**. 아무것도 추가 안 한 채 "undo 후 개수가 같다" 를
  검사하면 자동으로 통과하므로, 그 경우 edit 불변식은 아예 안 본다.

### 2. 내 스크립트 짜기

```ts
import { createApiKeyAuth, createFetchHttpPort, createFlowWorkspace } from '@flows/engine';

const http = createFetchHttpPort({
    baseUrl: process.env.FLOW_API_URL!,
    auth: createApiKeyAuth(process.env.FLOW_API_KEY ?? null),
});

const { engine, repository } = createFlowWorkspace({ http });

await repository.load('1007934');
console.log(engine.getGraph().nodes.length, repository.isDirty()); // → 4  false

engine.transact('add', ops => ops.addNode({ type: 'input-text', position: { x: 0, y: 0 } }));
console.log(repository.isDirty()); // → true
engine.undo();
console.log(repository.isDirty()); // → false  (로드된 그래프로 정확히 복귀)
```

실행까지 따라가려면 소켓과 세션을 붙인다. **waiter 를 run 요청보다 먼저** 등록해야 한다 —
서버는 요청을 받자마자 스트리밍을 시작하므로, 나중에 기다리면 run 전체를 놓친다.

```ts
import { createWebSocketPort, createRunSession } from '@flows/engine';

const socket = createWebSocketPort({ url: wsUrl }); // ?x-api-key=…&info=&channels=0000
const session = createRunSession({ engine, socket, currentFlowId: flowId });
socket.connect();

const settled = session.waitForNode(nodeId, { timeoutMs: 15_000 });
await repository.runNode(nodeId, undefined, {
    async: true,
    propagate: true,
    connection: session.connectionId() ?? undefined, // ← 없으면 서버가 아무에게도 안 보낸다
});
console.log((await settled).state); // → 'COMPLETED'
session.close();
socket.close();
```

**실행 방법** — Vitest 밖에서는 `@flows/*` 별칭이 안 풀리므로 번들해서 돌린다
(`engine:demo` 스크립트가 하는 것과 같다):

```bash
npx esbuild my-script.ts --bundle --platform=node --format=esm --target=node22 \
  --outfile=dist/my-script.mjs && node dist/my-script.mjs
```

한 파일짜리라면 상대 경로(`libs/engine/src/...`)로 임포트해서 `npx tsx` 로 바로 돌려도 된다.

**레포 밖에서라면 번들이 필요 없다** — 엔진은 **`@lemoncloud/flow-engine`** 으로 배포된다.
`import` 와 `require` 둘 다 된다(별도 빌드 2개). 번들은 런타임에 아무것도 import 하지
않지만, **`dependencies` 는 비어 있지 않다** — 배포되는 d.ts 가 `@lemoncloud/eureka-flows-api`
의 타입을 참조하므로 그 하나는 실제로 설치된다.

```bash
npm i @lemoncloud/flow-engine
```

```ts
import { createFlowEngine } from '@lemoncloud/flow-engine'; // ESM
const { createFlowEngine } = require('@lemoncloud/flow-engine'); // CJS
```

> 레포 안에서는 계속 `@flows/engine` 별칭을 쓴다(소스 직행). 두 이름은 같은 코드를 가리키고,
> 200곳 넘는 import 를 배포명으로 바꾸는 비용이 이득보다 커서 그대로 뒀다.
> 타르볼은 `libs/engine` 에서 `npm pack` — `prepack` 이 `build/` 에 d.ts + `.mjs`/`.cjs` 를 만든다.

### 3. 스펙으로 쓰기

`libs/engine` 은 `environment: 'node'` 로 돈다. 새 스펙은 `libs/engine/src/__tests__/` 에 두고
`npx nx test flow-engine`. 포트를 다 스텁으로 바꿀 필요는 없다 — `HttpPort` 는 메서드 하나,
`SocketPort` 는 다섯 개다 (`cli/stubHttpPort.ts`, `cli/stubSocketPort.ts` 참고).

> **스텁을 짤 땐 서버 응답 모양을 베껴라, 클라이언트 코드 말고.** 결함 4개 중 하나가 정확히
> 그것 때문에 유닛 테스트 255개가 green 인 채로 숨어 있었다 — 스텁 fixture 가 top-level `type` 을
> 갖고 있었는데, 서버는 그걸 한 번도 보낸 적이 없다. 자세한 건 `PLAN.md` §11.

---

## 더 볼 곳

|                       |                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`           | 레포 전체 관례. State/Data Flow 절이 이 브랜치에 맞게 갱신됐다 — 스토어는 투영, 그래프는 엔진 소유 |
| `docs/engine/PLAN.md` | Phase 0~6 실행 계획, 불변식, 결함 재현 절차, 정정 이력                                             |
