import type { BlockDefinitionWithFrontend, NodeData } from '@flows/flows';

export type ConfigValue = string | number | boolean | string[] | null;

export interface VisualizationProps {
    node: NodeData;
    definition: BlockDefinitionWithFrontend;
    /** Custom content height from node resize */
    contentHeight?: number;
}

export interface EditableVisualizationProps {
    node: NodeData;
    onConfigChange: (key: string, value: ConfigValue) => void;
}
