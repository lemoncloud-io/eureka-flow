import type { BlockDefinitionWithFrontend, GraphNode } from '@flows/flows';

export type ConfigValue = string | number | boolean | string[] | null;

export interface VisualizationProps {
    node: GraphNode;
    definition: BlockDefinitionWithFrontend;
    /** Custom content height from node resize */
    contentHeight?: number;
}

export interface EditableVisualizationProps {
    node: GraphNode;
    onConfigChange: (key: string, value: ConfigValue) => void;
}
