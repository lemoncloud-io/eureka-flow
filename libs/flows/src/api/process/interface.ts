import type {
    Actor,
    ChangeStatusInput,
    CreateActorInput,
    CreateItemInput,
    CreateNoteInput,
    CreateProcessInput,
    CreateTaskInput,
    CreateToolInput,
    Item,
    ItemListParams,
    Note,
    Process,
    ProcessApiListResponse,
    ProcessApiResponse,
    Stage,
    Task,
    Tool,
    UpdateActorInput,
    UpdateItemInput,
    UpdateProcessInput,
    UpdateStageInput,
    UpdateToolInput,
} from '../../types/process';

export interface ProxyProcessesApi {
    list(): Promise<ProcessApiListResponse<Process>>;
    get(id: string): Promise<ProcessApiResponse<Process>>;
    create(input: CreateProcessInput): Promise<ProcessApiResponse<Process>>;
    update(id: string, input: UpdateProcessInput): Promise<ProcessApiResponse<Process>>;
    remove(id: string): Promise<ProcessApiResponse<{ id: string }>>;
    apply(id: string, input: CreateItemInput): Promise<ProcessApiResponse<Item>>;
}

export interface ProxyItemsApi {
    list(params?: ItemListParams): Promise<ProcessApiListResponse<Item>>;
    get(id: string): Promise<ProcessApiResponse<Item>>;
    create(input: CreateItemInput): Promise<ProcessApiResponse<Item>>;
    update(id: string, input: UpdateItemInput): Promise<ProcessApiResponse<Item>>;
    remove(id: string): Promise<ProcessApiResponse<{ id: string }>>;
}

export interface ProxyStagesApi {
    get(id: string): Promise<ProcessApiResponse<Stage>>;
    update(id: string, input: UpdateStageInput): Promise<ProcessApiResponse<Stage>>;
    changeStatus(id: string, input: ChangeStatusInput): Promise<ProcessApiResponse<Stage>>;
    addNote(id: string, input: CreateNoteInput): Promise<ProcessApiResponse<Note>>;
    addTask(id: string, input: CreateTaskInput): Promise<ProcessApiResponse<Task>>;
}

export interface ProxyActorsApi {
    get(id: string): Promise<ProcessApiResponse<Actor>>;
    list(): Promise<ProcessApiListResponse<Actor>>;
    create(input: CreateActorInput): Promise<ProcessApiResponse<Actor>>;
    update(id: string, input: UpdateActorInput): Promise<ProcessApiResponse<Actor>>;
    deactivate(id: string): Promise<ProcessApiResponse<Actor>>;
    activate(id: string): Promise<ProcessApiResponse<Actor>>;
}

export interface ProxyToolsApi {
    hello(id?: string, param?: any, body?: any): Promise<ProcessApiResponse<string>>;
    get(id: string): Promise<ProcessApiResponse<Tool>>;
    list(): Promise<ProcessApiListResponse<Tool>>;
    create(input: CreateToolInput): Promise<ProcessApiResponse<Tool>>;
    update(id: string, input: UpdateToolInput): Promise<ProcessApiResponse<Tool>>;
    deactivate(id: string): Promise<ProcessApiResponse<Tool>>;
    activate(id: string): Promise<ProcessApiResponse<Tool>>;
}

export interface ProxyTasksApi {
    changeStatus(id: string, input: ChangeStatusInput): Promise<ProcessApiResponse<Task>>;
    addNote(id: string, input: CreateNoteInput): Promise<ProcessApiResponse<Note>>;
}

export interface ProxyNotesApi {
    resolve(id: string, input: { resolvedByActorId?: string }): Promise<ProcessApiResponse<Note>>;
    reopen(id: string): Promise<ProcessApiResponse<Note>>;
}

/**
 * Proxy API interface for AIStudio mocks.
 * This contract is intentionally scoped to `src/mocks`.
 */
export interface ProcessApi {
    processes: ProxyProcessesApi;
    items: ProxyItemsApi;
    stages: ProxyStagesApi;
    actors: ProxyActorsApi;
    tools: ProxyToolsApi;
    tasks: ProxyTasksApi;
    notes: ProxyNotesApi;
}
