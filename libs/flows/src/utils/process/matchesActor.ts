import type { Item } from '../../types/process/item';

/** True when any stage, task, or unresolved note on the item references the actor. */
export const matchesActor = (item: Item, actorId: string): boolean =>
    item.stages.some(
        s =>
            s.actorId === actorId ||
            s.tasks.some(task => task.actorId === actorId) ||
            s.notes.some(note => note.targetActorId === actorId && !note.isResolved)
    );
