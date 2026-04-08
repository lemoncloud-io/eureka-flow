# Frontend API Contract (프론트 호출 계약 전수 조사)

> 조사 기준: `libs/flows/src/api/`, `libs/web-core/src/api/`, `libs/socket/src/`
> 조사일: 2026-04-08
> 근거: 프론트엔드 코드 직접 읽기 (추정 없음)

---

## 1. HTTP Client 설정

**파일:** `libs/web-core/src/api/client.ts`

- Base URL: `VITE_API_URL` (기본값 `http://localhost:8000`)
- Timeout: 30초
- 헤더: `Content-Type: application/json`, `x-api-key: <apiKey>`
- 경로 prefix: API key에 따라 결정 (`libs/web-core/src/utils/apiEndpoint.ts`)
    - `apiKey === '#'` → prefix 없음 (로컬)
    - `apiKey.startsWith('ec-')` → `/_api_`
    - 그 외 → `/_apis`
- 최종 URL: `{VITE_API_URL}{prefix}{path}`

---

## 2. Flows API

**파일:** `libs/flows/src/api/flows.ts`

### GET /flows/{id}/load

| 항목      | 값                            |
| --------- | ----------------------------- |
| 메서드    | GET                           |
| 경로      | `/flows/{id}/load`            |
| Path 변수 | `id` (string, 필수) — Flow ID |
| Query     | 없음                          |
| Body      | 없음                          |
| 성공 응답 | `LoadFlowResult`              |
| 에러      | throw Error if id missing     |
| 재시도    | withRetry 3회                 |

**LoadFlowResult 스키마 (프론트 실사용 필드):**

```typescript
{
  id?: string;
  stereo?: '' | '#' | '#template';
  name?: string;
  state?: 'draft' | 'active' | 'archived';
  description?: string;
  nodes: NodeData[];      // 필수 — 캔버스에 그려짐
  edges: EdgeData[];      // 필수 — 연결선
  ports?: LoadFlowPortData[];  // 선택 — 포트 현재값
  channelId?: string;     // 선택 — WebSocket 구독 채널
  createdAt?: string;
  updatedAt?: string;
}
```

**LoadFlowPortData:**

```typescript
{
    id: string; // "nodeId:portDir" (예: "1004298:in")
    nodeId: string;
    portId: string; // "in" 또는 "out"
    data: DataPacket | null; // null 가능 (아직 데이터 없을 때)
}
```

---

### POST /flows/{id}/save

| 항목      | 값                                |
| --------- | --------------------------------- |
| 메서드    | POST                              |
| 경로      | `/flows/{id}/save`                |
| Path 변수 | `id` (string) — `"0"`이면 새 생성 |
| Body      | `SaveFlowBody`                    |
| 성공 응답 | `SaveFlowView`                    |

**SaveFlowBody:**

```typescript
{
  nodes: NodeData[];   // 필수
  edges: EdgeData[];   // 필수
}
```

**SaveFlowView (응답):**

```typescript
{
  id?: string;
  name?: string;
  state?: FlowState;
  nodes?: NodeData[];
  edges?: EdgeData[];
  ports?: NodeView[];
  // deprecated (하위 호환):
  nodes$$?: NodeView[];
  edges$$?: EdgeView[];
  ports$$?: NodeView[];
}
```

---

### POST /flows/{id}/upsert

| 항목      | 값                             |
| --------- | ------------------------------ |
| 메서드    | POST                           |
| 경로      | `/flows/{id}/upsert`           |
| Path 변수 | `id` (string, 필수)            |
| Body      | `SaveFlowBody` (nodes + edges) |
| 성공 응답 | `SaveFlowView`                 |

---

### POST /flows/{id}

| 항목      | 값                  |
| --------- | ------------------- |
| 메서드    | POST                |
| 경로      | `/flows/{id}`       |
| Path 변수 | `id` (string, 필수) |
| Body      | `UpdateFlowBody`    |
| 성공 응답 | `FlowView`          |

**UpdateFlowBody:**

```typescript
{ name?: string }
```

---

## 3. Blocks API

**파일:** `libs/flows/src/api/blocks.ts`

### GET /blocks/0/list

| 항목      | 값                                  |
| --------- | ----------------------------------- |
| 메서드    | GET                                 |
| 경로      | `/blocks/0/list?cores=1&limit=-1`   |
| 성공 응답 | `ListResult<BlockViewWithFrontend>` |

**응답 구조:**

```typescript
{
  list: BlockViewWithFrontend[];  // 배열
}
```

**프론트가 사용하는 BlockViewWithFrontend 필드:**

```typescript
{
  // BlockView 레벨 (서버 응답 최상위)
  $definition: {
    id: string;
    type: string;        // "input-text", "search", "content" 등
    label: string;       // 필수 — 없으면 필터링됨
    description?: string;
    inputs?: PortDefinition[];
    outputs?: PortDefinition[];
    configSchema?: ConfigField[];
    execute?: Function;  // 서버 정의, 프론트에서 덮어씀
  };
  isFrontend?: 0 | 1;    // BoolFlag — 프론트에서 boolean으로 변환
  stereo?: 'input' | 'process' | 'output';
  isRunnable?: boolean;
}
```

**프론트 처리 로직:**

1. `$definition.label`이 없으면 필터링
2. `isFrontend`를 `0|1` → `boolean` 변환
3. `isFrontend: true`면 `EXECUTE_FUNCTIONS[type]` 연결
4. `isFrontend: false`면 서버 실행 (POST /nodes/:id/run)
5. `isFrontend: undefined`면 레거시 BACKEND_PROCESSOR_TYPES 확인

---

## 4. Nodes API

**파일:** `libs/flows/src/api/nodes.ts`

### POST /nodes/0/list

| 항목      | 값                     |
| --------- | ---------------------- |
| 메서드    | POST                   |
| 경로      | `/nodes/0/list`        |
| Body      | `{ flowId: string }`   |
| 성공 응답 | `{ list: NodeView[] }` |
| 재시도    | withRetry 3회          |

---

### GET /nodes/{id}

| 항목      | 값            |
| --------- | ------------- |
| 메서드    | GET           |
| 경로      | `/nodes/{id}` |
| 성공 응답 | `NodeView`    |

---

### POST /nodes/0

| 항목      | 값                                      |
| --------- | --------------------------------------- |
| 메서드    | POST                                    |
| 경로      | `/nodes/0`                              |
| Body      | `NodeBody` (name, flowId, blockId 필수) |
| 성공 응답 | `NodeView`                              |

---

### POST /nodes/{id}/upsert?flowId={flowId}

| 항목      | 값                                                               |
| --------- | ---------------------------------------------------------------- |
| 메서드    | POST                                                             |
| 경로      | `/nodes/{id}/upsert`                                             |
| Path 변수 | `id` — `"0"`이면 새 생성                                         |
| Query     | `flowId` (필수)                                                  |
| Body      | `Partial<NodeView>` (config, output, blockId, position 등)       |
| 성공 응답 | `UpsertNodeResult` → `{ nodes: NodeData[], edges?: EdgeData[] }` |

**특수 케이스 — 포트 노드 upsert:**

```typescript
// POST /nodes/0/upsert?flowId={flowId}
// Body: { nodes: [{ stereo: 'port', parentId, direction, name, data$ }] }
```

---

### POST /nodes/{nodeId}/run

| 항목           | 값                                                                       |
| -------------- | ------------------------------------------------------------------------ |
| 메서드         | POST                                                                     |
| 경로           | `/nodes/{nodeId}/run`                                                    |
| Query (플래그) | `async` (flag), `force` (flag), `propagate=0` (비전파)                   |
| Body           | `{ config?: Record<string,string>, output?: Record<string,DataPacket> }` |
| 성공 응답      | `NodeView`                                                               |

**Query 빌드 로직:**

```typescript
const params: string[] = [];
if (options?.async) params.push('async');
if (options?.force) params.push('force');
if (options?.propagate === false) params.push('propagate=0');
// → /nodes/{id}/run?async&force&propagate=0
```

---

### DELETE /nodes/{id}

| 항목      | 값                  |
| --------- | ------------------- |
| 메서드    | DELETE              |
| 경로      | `/nodes/{id}`       |
| 성공 응답 | void (204 또는 200) |

---

### GET /nodes/{portId}/port?direction={dir}

| 항목      | 값                            |
| --------- | ----------------------------- |
| 메서드    | GET                           |
| 경로      | `/nodes/{portId}/port`        |
| Query     | `direction` = `in` 또는 `out` |
| 성공 응답 | `PortDataResponse`            |

**PortDataResponse:**

```typescript
{
  id: string;           // "1000882:in@in"
  nodeId: string;       // "1000882"
  portId: string;       // "in"
  direction: 'in' | 'out';
  data: {
    value: unknown;
    type: string;
    timestamp?: number;
  };
}
```

---

### GET /nodes/0/image?s3Url={url}

| 항목      | 값                                                      |
| --------- | ------------------------------------------------------- |
| 메서드    | GET                                                     |
| 경로      | `/nodes/0/image`                                        |
| Query     | `s3Url` (s3://bucket/key 형식)                          |
| 성공 응답 | `{ body: string, headers: { 'Content-Type': string } }` |

프론트가 `data:${contentType};base64,${body}`로 변환하여 사용.

---

### GET /nodes/0/image-info?s3Url={url}

| 항목      | 값                    |
| --------- | --------------------- |
| 메서드    | GET                   |
| 경로      | `/nodes/0/image-info` |
| Query     | `s3Url`               |
| 성공 응답 | `S3ImageInfo`         |

**S3ImageInfo:**

```typescript
{
  s3Url: string;
  parsed: {
    bucket: string;
    key: string;
    md5: string;
    sizeKb: number;
    ext: string;
    prefix?: string;
  };
  allowed: boolean;
}
```

---

### POST /nodes/{id}/touch

| 항목      | 값                                                           |
| --------- | ------------------------------------------------------------ |
| 메서드    | POST                                                         |
| 경로      | `/nodes/{id}/touch`                                          |
| Body      | `TouchNodeBody` (timestamp, progress, disabled, position 등) |
| 성공 응답 | `NodeView`                                                   |
| 비고      | 디버그/테스트용                                              |

---

## 5. Edges API

**파일:** `libs/flows/src/api/edges.ts`

### POST /edges/0/list

| 항목      | 값                     |
| --------- | ---------------------- |
| 메서드    | POST                   |
| 경로      | `/edges/0/list`        |
| Body      | `{ flowId: string }`   |
| 성공 응답 | `{ list: EdgeView[] }` |
| 재시도    | withRetry 3회          |

---

### GET /edges/{id}

| 항목      | 값            |
| --------- | ------------- |
| 메서드    | GET           |
| 경로      | `/edges/{id}` |
| 성공 응답 | `EdgeView`    |

---

### POST /edges/0

| 항목      | 값         |
| --------- | ---------- |
| 메서드    | POST       |
| 경로      | `/edges/0` |
| Body      | `EdgeBody` |
| 성공 응답 | `EdgeView` |

---

### POST /edges/{id}

| 항목      | 값            |
| --------- | ------------- |
| 메서드    | POST          |
| 경로      | `/edges/{id}` |
| Body      | `EdgeBody`    |
| 성공 응답 | `EdgeView`    |

---

### DELETE /edges/{id}

| 항목      | 값            |
| --------- | ------------- |
| 메서드    | DELETE        |
| 경로      | `/edges/{id}` |
| 성공 응답 | void          |

**EdgeBody/EdgeView 공통 필드:**

```typescript
{
  id?: string;
  stereo?: '' | '#' | '#condition' | '#transform';
  label?: string;
  flowId?: string;
  sourceNodeId?: string;
  sourcePortId?: string;
  targetNodeId?: string;
  targetPortId?: string;
  condition?: string;
  priority?: number;
  position?: { x: number; y: number };
  disabled?: boolean;
  meta?: unknown;
  createdAt?: string;
  updatedAt?: string;
}
```

---

## 6. System API

**파일:** `libs/flows/src/api/system.ts`

### GET / (루트)

| 항목   | 값                                            |
| ------ | --------------------------------------------- |
| 메서드 | GET                                           |
| 경로   | `/` (prefix 없이 API_URL 직접)                |
| 응답   | plain text: `name/version` 줄 단위            |
| 비고   | `/_apis` prefix 붙지 않음 — API_URL 직접 호출 |

**응답 예시:**

```
eureka-flows-api/0.26.227b
lemon-core/4.1.15
```

---

## 7. WebSocket

**파일:** `libs/socket/src/`

### 연결

- URL: `{VITE_WS_ENDPOINT}?x-api-key={token}&default=&info=&channels={flowId}`
- Query params: `x-api-key`, `default`, `info`, `channels`
- Worker 기반 (`public/websocket.worker.js`)
- Heartbeat: 60초 ping, 10초 pong 대기
- 재연결: 지수 백오프, 30초 상한, 최대 10회

### 서버 → 클라이언트 메시지 형식

**Raw wrapper:**

```typescript
{
  action: 'message' | 'info' | 'ping' | 'pong';
  ts?: string;
  data?: SocketDataMessage;
  channel?: string;
}
```

### 메시지 타입 3종

**1. Flow Update:**

```typescript
{ type: 'flow', id: string, timestamp: number }
```

→ 프론트: `GET /flows/{id}/load` 재호출

**2. Node Update:**

```typescript
{
  type: 'node',
  id: string,              // nodeId
  flowId?: string,
  state?: 'IDLE' | 'READY' | 'RUNNING' | 'COMPLETED' | 'ERROR',
  prevState?: NodeState,
  progress?: number,       // 0~100
  no?: number,             // 시퀀스 번호 (높을수록 최신)
  stereo?: number,         // 0이면 추가 API 호출 불필요
  timestamp?: number,
  // deprecated:
  status?: string,
  prevStatus?: string,
}
```

→ 프론트: 캔버스 노드 상태 업데이트

**3. Port Update:**

```typescript
{
  type: 'node/port',
  id: string,              // "nodeId:direction@portName"
  flowId?: string,
  timestamp?: number,
  no?: number,
}
```

→ 프론트: `GET /nodes/{portId}/port?direction=...` 호출하여 포트 데이터 갱신

---

## 8. 핵심 공유 타입

**NodeData** (`@lemoncloud/eureka-flows-api`에서 import):

- 서버 응답과 요청에서 사용되는 노드 직렬화 형식
- config, inputData, outputData는 object 형식

**EdgeData** (`@lemoncloud/eureka-flows-api`에서 import):

- 서버 응답과 요청에서 사용되는 엣지 직렬화 형식

**DataPacket:**

```typescript
{ value: unknown; type: 'text' | 'image' | 'number' | 'json' | 'any'; timestamp?: number }
```

**PortData (서버 저장 형식):**

```typescript
{ S?: string; N?: number; F?: number; M?: string; timestamp?: number }
```

---

## 9. Prefix 규칙 (중요)

프론트 Axios 인터셉터가 모든 요청에 prefix를 자동 추가한다.
최종 URL = `{VITE_API_URL}{prefix}{path}`

| 조건                       | prefix      | 예시 URL                                       |
| -------------------------- | ----------- | ---------------------------------------------- |
| `apiKey === '#'`           | `""` (없음) | `http://localhost:8800/flows/123/load`         |
| `apiKey.startsWith('ec-')` | `/_api_`    | `https://api.example.com/_api_/flows/123/load` |
| 그 외 모든 key             | `/_apis`    | `https://api.example.com/_apis/flows/123/load` |

**근거:** `libs/web-core/src/utils/apiEndpoint.ts:14-20`
**적용:** `libs/web-core/src/api/client.ts:46` — `config.baseURL = API_URL + getApiEndpointPath(apiKey)`

→ 백엔드는 `/_apis/*`, `/_api_/*`, `/*` 세 가지 prefix 모두 동일 핸들러로 라우팅해야 함.

---

## 10. API 전체 목록

**HTTP 엔드포인트: 21개** (flows 4 + blocks 1 + nodes 10 + edges 5 + system 1)
**WebSocket 라우트: 3개** ($connect, $disconnect, $default)

> 이전 요약에서 "19개"로 기재한 이유: edges CRUD 4개(GET/POST/POST/DELETE)를
> 2개로 뭉쳐 셌고, 실제로는 create(POST /edges/0)와 update(POST /edges/{id})가
> 별도 endpoint. 정확한 집계는 아래 표 기준 21개.

| #   | 메서드 | 경로                                          | Caller 파일                    | 함수명                 | 우선순위 |
| --- | ------ | --------------------------------------------- | ------------------------------ | ---------------------- | -------- |
| 1   | GET    | /flows/{id}/load                              | `libs/flows/src/api/flows.ts`  | `loadFlow()`           | P1       |
| 2   | POST   | /flows/{id}/save                              | `libs/flows/src/api/flows.ts`  | `saveFlow()`           | P1       |
| 3   | POST   | /flows/{id}/upsert                            | `libs/flows/src/api/flows.ts`  | `upsertFlow()`         | P1       |
| 4   | POST   | /flows/{id}                                   | `libs/flows/src/api/flows.ts`  | `updateFlowMetadata()` | P1       |
| 5   | GET    | /blocks/0/list?cores=1&limit=-1               | `libs/flows/src/api/blocks.ts` | `listBlocks()`         | P1       |
| 6   | POST   | /nodes/0/list                                 | `libs/flows/src/api/nodes.ts`  | `listNodes()`          | P1       |
| 7   | GET    | /nodes/{id}                                   | `libs/flows/src/api/nodes.ts`  | `getNode()`            | P1       |
| 8   | POST   | /nodes/0                                      | `libs/flows/src/api/nodes.ts`  | `createNode()`         | P1       |
| 9   | POST   | /nodes/{id}/upsert?flowId={fid}               | `libs/flows/src/api/nodes.ts`  | `upsertNode()`         | P1       |
| 10  | POST   | /nodes/{nodeId}/run[?async&force&propagate=0] | `libs/flows/src/api/nodes.ts`  | `runNode()`            | P1       |
| 11  | DELETE | /nodes/{id}                                   | `libs/flows/src/api/nodes.ts`  | `deleteNode()`         | P1       |
| 12  | GET    | /nodes/{portId}/port?direction={dir}          | `libs/flows/src/api/nodes.ts`  | `getPortData()`        | P1       |
| 13  | GET    | /nodes/0/image?s3Url={url}                    | `libs/flows/src/api/nodes.ts`  | `getImageFromS3()`     | P2       |
| 14  | GET    | /nodes/0/image-info?s3Url={url}               | `libs/flows/src/api/nodes.ts`  | `getImageInfo()`       | P2       |
| 15  | POST   | /nodes/{id}/touch                             | `libs/flows/src/api/nodes.ts`  | `touchNode()`          | P3       |
| 16  | POST   | /edges/0/list                                 | `libs/flows/src/api/edges.ts`  | `listEdges()`          | P1       |
| 17  | GET    | /edges/{id}                                   | `libs/flows/src/api/edges.ts`  | `getEdge()`            | P1       |
| 18  | POST   | /edges/0                                      | `libs/flows/src/api/edges.ts`  | `createEdge()`         | P1       |
| 19  | POST   | /edges/{id}                                   | `libs/flows/src/api/edges.ts`  | `updateEdge()`         | P1       |
| 20  | DELETE | /edges/{id}                                   | `libs/flows/src/api/edges.ts`  | `deleteEdge()`         | P1       |
| 21  | GET    | / (prefix 없이 API_URL 직접)                  | `libs/flows/src/api/system.ts` | `getSystemInfo()`      | P1       |

**WebSocket:**

| 이벤트                  | 방향      | Caller/Consumer 파일                          | 용도                 |
| ----------------------- | --------- | --------------------------------------------- | -------------------- |
| $connect                | 클라→서버 | `libs/socket/src/hooks/useWebSocketWorker.ts` | 연결 + 채널 구독     |
| $disconnect             | 클라→서버 | `libs/socket/src/hooks/useWebSocketWorker.ts` | 연결 해제            |
| ping/pong               | 양방향    | `apps/web/public/websocket.worker.js`         | 60초 heartbeat       |
| `{ type: 'flow' }`      | 서버→클라 | `libs/socket/src/hooks/useInitFlowSocket.ts`  | 플로우 리로드 트리거 |
| `{ type: 'node' }`      | 서버→클라 | `libs/socket/src/hooks/useInitFlowSocket.ts`  | 노드 상태 업데이트   |
| `{ type: 'node/port' }` | 서버→클라 | `libs/socket/src/hooks/useInitFlowSocket.ts`  | 포트 데이터 변경     |
