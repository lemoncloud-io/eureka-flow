import type { DataPacket, NodeData } from '@lemoncloud/eureka-flows-api';

/**
 * What `GET /nodes/:id` sends, as opposed to what the graph holds.
 *
 * The server describes a node's config and port data as arrays — `config$`, `inputData$$`,
 * `outputData$$` — while the graph holds them as objects keyed by config key or port id.
 * `NodeData` declares only the object form, so the array form has no type to arrive under
 * and every reader has had to reach past the declared shape to find it.
 *
 * This is the HTTP counterpart of what `parseSocketFrame` does for the socket wire, and it
 * lives here for the same reason: `repository.runNode` returns a `NodeData` straight off
 * this endpoint, so anything headless needs to decode it too.
 */
interface ConfigItem {
    key: string;
    val: string;
}

interface PacketItem {
    portId: string;
    packet: DataPacket;
}

const isConfigItems = (value: unknown): value is ConfigItem[] => Array.isArray(value);
const isPacketItems = (value: unknown): value is PacketItem[] => Array.isArray(value);

const fromConfigItems = (items: ConfigItem[]): Record<string, string> =>
    Object.fromEntries(items.map(item => [item.key, item.val]));

const fromPacketItems = (items: PacketItem[]): Record<string, DataPacket> =>
    Object.fromEntries(items.map(item => [item.portId, item.packet]));

/** The three fields the wire disagrees with the graph about. */
export interface NodeViewFields {
    config?: Record<string, string>;
    inputData?: Record<string, DataPacket>;
    outputData?: Record<string, DataPacket>;
}

/**
 * Resolve a server node view against the node the graph already holds.
 *
 * The three fields do not merge the same way, and the difference is deliberate rather than
 * an oversight to tidy up:
 *
 * - **config** replaces. A config object is complete every time it is sent, and merging
 *   would resurrect a key the user had just deleted.
 * - **inputData** replaces when it arrives as `inputData$$` — that array is the node's
 *   whole input state — but merges when it arrives as the object form, which is how a
 *   single port update is delivered.
 * - **outputData** always merges. Ports report their results one at a time.
 *
 * Absent fields leave the current value alone; they mean "unchanged", not "empty".
 */
export const mergeNodeView = (current: NodeViewFields, serverData: Partial<NodeData>): NodeViewFields => {
    const raw = serverData as unknown as Record<string, unknown>;

    const config = isConfigItems(raw['config$'])
        ? fromConfigItems(raw['config$'])
        : (serverData.config ?? current.config);

    const inputData = isPacketItems(raw['inputData$$'])
        ? fromPacketItems(raw['inputData$$'])
        : serverData.inputData
          ? { ...current.inputData, ...serverData.inputData }
          : current.inputData;

    const incomingOutput = isPacketItems(raw['outputData$$'])
        ? fromPacketItems(raw['outputData$$'])
        : Object.keys(serverData.outputData ?? {}).length > 0
          ? serverData.outputData
          : undefined;

    const outputData = incomingOutput ? { ...current.outputData, ...incomingOutput } : current.outputData;

    return { config, inputData, outputData };
};
