/**
 * Every text field carries its language key in a sibling field suffixed `En`
 * (`label` ↔ `labelEn`). The web app translates the key and falls back to the
 * original text, so a blank key just means "not translated yet".
 * @see docs/i18n-server-keys.md
 */
export interface Port {
    id: string;
    label: string;
    labelEn?: string;
    type: string;
}

export interface ConfigOption {
    label: string;
    labelEn?: string;
    value: string;
}

export interface ConfigItem {
    key: string;
    type: 'text' | 'number' | 'boolean' | 'select' | 'file' | 'separator';
    label: string;
    labelEn?: string;
    placeholder?: string;
    placeholderEn?: string;
    defaultValue?: string;
    options?: ConfigOption[];
    short?: number | boolean;
}

export type BlockStereo = 'input' | 'process' | 'output';

export interface Block {
    id: string;
    createdAt: number;
    updatedAt: number;
    deletedAt: number;
    stereo: BlockStereo;
    name: string;
    label: string;
    labelEn?: string;
    icon: string;
    description: string;
    descriptionEn?: string;
    order: number;
    processType: string;
    input$: Port[];
    output$: Port[];
    config$: ConfigItem[];
    isFrontend: boolean;
}

export type BlockFormData = Omit<Block, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export const STEREO_OPTIONS: { label: string; value: BlockStereo }[] = [
    { label: 'Input', value: 'input' },
    { label: 'Process', value: 'process' },
    { label: 'Output', value: 'output' },
];

export const CONFIG_TYPE_OPTIONS: { label: string; value: ConfigItem['type'] }[] = [
    { label: 'Text', value: 'text' },
    { label: 'Number', value: 'number' },
    { label: 'Boolean', value: 'boolean' },
    { label: 'Select', value: 'select' },
    { label: 'File', value: 'file' },
    { label: 'Separator', value: 'separator' },
];

export const PORT_TYPE_OPTIONS = ['text', 'image', 'any'];
