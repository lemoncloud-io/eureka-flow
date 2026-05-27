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

/**
 * API for managing Processes (Templates).
 */
export interface ProxyProcessesApi {
    /** List all available process templates */
    list(): Promise<ProcessApiListResponse<Process>>;

    /** Retrieve a specific process template by ID */
    get(id: string): Promise<ProcessApiResponse<Process>>;

    /** Create a new process template */
    create(input: CreateProcessInput): Promise<ProcessApiResponse<Process>>;

    /** Update an existing process template */
    update(id: string, input: UpdateProcessInput): Promise<ProcessApiResponse<Process>>;

    /** Delete a process template */
    remove(id: string): Promise<ProcessApiResponse<{ id: string }>>;

    /**
     * Instantiates (duplicates) an Item from a Process Template.
     *
     * @param id The ID of the Process template to apply.
     * @param input Input containing the new Item's name, optional meta, and optional thumbnailUrl.
     *
     * ### 📂 Template Duplication & ID Remapping Logic:
     * When a template is instantiated into an active Item, a deep copy is performed:
     * 1. **Item ID Generation**: Generates a new unique ID for the Item (`item-${timestamp}`).
     * 2. **Stage ID Mapping**: Since process template stage IDs are template-static, they must be remapped
     *    to globally unique IDs for the active Item.
     *    - Each stage ID is re-generated in the format: `s${order}-${randomString}` (e.g., `s1-a8d2f1`).
     * 3. **Stage Data Instantiation**:
     *    - Associates the stage with the newly created `itemId` and the original `processId`.
     *    - Resets the stage status to `'todo'`.
     *    - Resets/generates fresh `createdAt` and `updatedAt` timestamps.
     * 4. **Dependency Resolution**:
     *    - Crucially remaps internal stage-to-stage dependencies (`dependencyStageIds`) from the old template static
     *      stage IDs to the newly generated active stage IDs using the remapping dictionary, preserving the DAG (Directed Acyclic Graph)
     *      integrity inside the instantiated item.
     */
    apply(id: string, input: CreateItemInput): Promise<ProcessApiResponse<Item>>;
}

/**
 * API for managing active Items (instantiated processes).
 */
export interface ProxyItemsApi {
    /** List all active items with optional pagination, sorting, and actor-filtering params */
    list(params?: ItemListParams): Promise<ProcessApiListResponse<Item>>;

    /** Get a single active item by ID */
    get(id: string): Promise<ProcessApiResponse<Item>>;

    /** Directly create an active item without a template */
    create(input: CreateItemInput): Promise<ProcessApiResponse<Item>>;

    /** Update an active item's attributes (e.g. name, thumbnailUrl, metadata) */
    update(id: string, input: UpdateItemInput): Promise<ProcessApiResponse<Item>>;

    /** Delete an active item and its stages */
    remove(id: string): Promise<ProcessApiResponse<{ id: string }>>;
}

/**
 * API for managing individual Stages within an active Item.
 */
export interface ProxyStagesApi {
    /** Retrieve stage metadata and contents */
    get(id: string): Promise<ProcessApiResponse<Stage>>;

    /** Update standard stage properties */
    update(id: string, input: UpdateStageInput): Promise<ProcessApiResponse<Stage>>;

    /** Update status ('todo' | 'doing' | 'done') and check stage-level dependencies */
    changeStatus(id: string, input: ChangeStatusInput): Promise<ProcessApiResponse<Stage>>;

    /** Append a new discussion/issue note to the stage */
    addNote(id: string, input: CreateNoteInput): Promise<ProcessApiResponse<Note>>;

    /** Add a sub-task / checklist item to the stage */
    addTask(id: string, input: CreateTaskInput): Promise<ProcessApiResponse<Task>>;
}

/**
 * API for managing Actors (Teams, Persons, External Vendors).
 */
export interface ProxyActorsApi {
    /** Get actor info by ID */
    get(id: string): Promise<ProcessApiResponse<Actor>>;

    /** List all actors */
    list(): Promise<ProcessApiListResponse<Actor>>;

    /** Create a new actor */
    create(input: CreateActorInput): Promise<ProcessApiResponse<Actor>>;

    /** Update actor properties (name, color, memo, stereo) */
    update(id: string, input: UpdateActorInput): Promise<ProcessApiResponse<Actor>>;

    /** Deactivate an actor (soft delete/hide) */
    deactivate(id: string): Promise<ProcessApiResponse<Actor>>;

    /** Reactivate an actor */
    activate(id: string): Promise<ProcessApiResponse<Actor>>;
}

/**
 * API for managing External Tools integrated with stages.
 */
export interface ProxyToolsApi {
    /** Execute template test calls for external systems */
    hello(id?: string, param?: any, body?: any): Promise<ProcessApiResponse<string>>;

    /** Get tool information and templates */
    get(id: string): Promise<ProcessApiResponse<Tool>>;

    /** List all tools */
    list(): Promise<ProcessApiListResponse<Tool>>;

    /** Register an external tool with URL templates */
    create(input: CreateToolInput): Promise<ProcessApiResponse<Tool>>;

    /** Update tool registration */
    update(id: string, input: UpdateToolInput): Promise<ProcessApiResponse<Tool>>;

    /** Soft-deactivate an external tool */
    deactivate(id: string): Promise<ProcessApiResponse<Tool>>;

    /** Reactivate a tool */
    activate(id: string): Promise<ProcessApiResponse<Tool>>;
}

/**
 * API for managing Sub-tasks within a stage.
 */
export interface ProxyTasksApi {
    /** Change a sub-task's status (todo/doing/done) */
    changeStatus(id: string, input: ChangeStatusInput): Promise<ProcessApiResponse<Task>>;

    /** Add a discussion note directly nested under a sub-task */
    addNote(id: string, input: CreateNoteInput): Promise<ProcessApiResponse<Note>>;
}

/**
 * API for managing Stage and Sub-task Notes.
 */
export interface ProxyNotesApi {
    /** Mark an issue note as resolved */
    resolve(id: string, input: { resolvedByActorId?: string }): Promise<ProcessApiResponse<Note>>;

    /** Re-open a resolved note */
    reopen(id: string): Promise<ProcessApiResponse<Note>>;
}

/**
 * Proxy API interface for AIStudio mocks and Proxy servers.
 * This contract regulates frontend-to-backend communication boundaries.
 */
export interface ProcessApi {
    /** Process Templates management API */
    processes: ProxyProcessesApi;
    /** Active items (instantiated templates) management API */
    items: ProxyItemsApi;
    /** Stages management API */
    stages: ProxyStagesApi;
    /** Actors management API */
    actors: ProxyActorsApi;
    /** External Tools integration API */
    tools: ProxyToolsApi;
    /** Stage Tasks management API */
    tasks: ProxyTasksApi;
    /** Discussion and Issue notes API */
    notes: ProxyNotesApi;
}
