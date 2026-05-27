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
    UpdateItemInput,
    UpdateProcessInput,
    UpdateStageInput,
} from '../../types/process';

export interface ProcessApi {
    processes: {
        list(): Promise<ProcessApiListResponse<Process>>;
        get(id: string): Promise<ProcessApiResponse<Process>>;
        create(input: CreateProcessInput): Promise<ProcessApiResponse<Process>>;
        update(id: string, input: UpdateProcessInput): Promise<ProcessApiResponse<Process>>;
        remove(id: string): Promise<ProcessApiResponse<{ id: string }>>;
        apply(id: string, input: CreateItemInput): Promise<ProcessApiResponse<Item>>;
    };
    items: {
        list(params?: ItemListParams): Promise<ProcessApiListResponse<Item>>;
        get(id: string): Promise<ProcessApiResponse<Item>>;
        create(input: CreateItemInput): Promise<ProcessApiResponse<Item>>;
        update(id: string, input: UpdateItemInput): Promise<ProcessApiResponse<Item>>;
        remove(id: string): Promise<ProcessApiResponse<{ id: string }>>;
    };
    stages: {
        get(id: string): Promise<ProcessApiResponse<Stage>>;
        update(id: string, input: UpdateStageInput): Promise<ProcessApiResponse<Stage>>;
        changeStatus(id: string, input: ChangeStatusInput): Promise<ProcessApiResponse<Stage>>;
        addNote(id: string, input: CreateNoteInput): Promise<ProcessApiResponse<Note>>;
        addTask(id: string, input: CreateTaskInput): Promise<ProcessApiResponse<Task>>;
    };
    tasks: {
        changeStatus(id: string, input: ChangeStatusInput): Promise<ProcessApiResponse<Task>>;
        addNote(id: string, input: CreateNoteInput): Promise<ProcessApiResponse<Note>>;
    };
    notes: {
        resolve(id: string, input: { resolvedByActorId?: string }): Promise<ProcessApiResponse<Note>>;
        reopen(id: string): Promise<ProcessApiResponse<Note>>;
    };
    actors: {
        list(): Promise<ProcessApiListResponse<Actor>>;
        create(input: CreateActorInput): Promise<ProcessApiResponse<Actor>>;
        update(id: string, input: Partial<Actor>): Promise<ProcessApiResponse<Actor>>;
        deactivate(id: string): Promise<ProcessApiResponse<Actor>>;
        activate(id: string): Promise<ProcessApiResponse<Actor>>;
    };
    tools: {
        list(): Promise<ProcessApiListResponse<Tool>>;
        create(input: CreateToolInput): Promise<ProcessApiResponse<Tool>>;
        update(id: string, input: Partial<Tool>): Promise<ProcessApiResponse<Tool>>;
        deactivate(id: string): Promise<ProcessApiResponse<Tool>>;
        activate(id: string): Promise<ProcessApiResponse<Tool>>;
    };
}
