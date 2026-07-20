import type { Block, BlockFormData, BlockStereo, ConfigItem, Port } from '../types';

/**
 * Server-side block shapes (eureka-flows-api).
 * The stored model uses `$$`-suffixed arrays (`input$$`/`output$$`/`config$$`),
 * distinct from the admin UI model's single-`$` names.
 */
interface ServerPort {
    id: string;
    label?: string;
    labelEn?: string;
    type?: string;
    required?: boolean;
}

interface ServerConfigOption {
    label: string;
    labelEn?: string;
    value: string;
}

interface ServerConfig {
    key: string;
    type: string;
    label?: string;
    labelEn?: string;
    placeholder?: string;
    placeholderEn?: string;
    defaultValue?: string;
    options?: ServerConfigOption[];
    short?: 0 | 1;
}

/** A single item from `GET /blocks/0/list` (top-level BlockView carries the model fields). */
export interface BlockView {
    id: string;
    stereo?: string;
    name?: string;
    nameEn?: string;
    labelEn?: string;
    visualType?: string;
    label?: string;
    icon?: string;
    description?: string;
    descriptionEn?: string;
    order?: number;
    processType?: string;
    isFrontend?: boolean;
    input$$?: ServerPort[];
    output$$?: ServerPort[];
    config$$?: ServerConfig[];
    createdAt?: number;
    updatedAt?: number;
    deletedAt?: number;
}

/** Writable POST body for `POST /blocks/0` (create). `bodyToModel` reads the `$$` names. */
export interface BlockBody {
    stereo?: string;
    name?: string;
    nameEn?: string;
    label?: string;
    labelEn?: string;
    icon?: string;
    description?: string;
    descriptionEn?: string;
    order?: number;
    processType?: string;
    isFrontend?: boolean;
    input$$?: ServerPort[];
    output$$?: ServerPort[];
    config$$?: ServerConfig[];
}

const isStereo = (s: string | undefined): s is BlockStereo => s === 'input' || s === 'process' || s === 'output';

const toUiPorts = (ports: ServerPort[] | undefined): Port[] =>
    (ports ?? []).map(p => ({
        id: p.id,
        label: p.label ?? '',
        labelEn: p.labelEn,
        type: p.type ?? 'any',
        required: p.required,
    }));

const toUiConfigs = (configs: ServerConfig[] | undefined): ConfigItem[] =>
    (configs ?? []).map(c => ({
        key: c.key,
        type: (c.type as ConfigItem['type']) ?? 'text',
        label: c.label ?? '',
        labelEn: c.labelEn,
        placeholder: c.placeholder,
        placeholderEn: c.placeholderEn,
        defaultValue: c.defaultValue,
        options: c.options,
        short: c.short,
    }));

/** Read mapping: server BlockView → admin Block. */
export const blockViewToBlock = (v: BlockView): Block => ({
    id: v.id,
    createdAt: v.createdAt ?? 0,
    updatedAt: v.updatedAt ?? 0,
    deletedAt: v.deletedAt ?? 0,
    stereo: isStereo(v.stereo) ? v.stereo : 'process',
    name: v.name ?? '',
    nameEn: v.nameEn,
    label: v.label ?? '',
    labelEn: v.labelEn,
    icon: v.icon ?? '',
    description: v.description ?? '',
    descriptionEn: v.descriptionEn,
    order: v.order ?? 0,
    processType: v.processType ?? v.visualType ?? '',
    input$: toUiPorts(v.input$$),
    output$: toUiPorts(v.output$$),
    config$: toUiConfigs(v.config$$),
    isFrontend: !!v.isFrontend,
});

const toServerPorts = (ports: Port[]): ServerPort[] =>
    ports.map(p => ({ id: p.id, label: p.label, labelEn: p.labelEn, type: p.type, required: p.required }));

const toServerConfigs = (configs: ConfigItem[]): ServerConfig[] =>
    configs.map(c => ({
        key: c.key,
        type: c.type,
        label: c.label,
        labelEn: c.labelEn,
        placeholder: c.placeholder,
        placeholderEn: c.placeholderEn,
        // server stores defaultValue as a string
        defaultValue: c.defaultValue != null ? String(c.defaultValue) : undefined,
        options: c.options,
        short: c.short ? 1 : 0,
    }));

/** Write mapping: admin form data → server BlockBody (`$$` names, stringified defaults). */
export const blockToBlockBody = (form: BlockFormData): BlockBody => ({
    stereo: form.stereo,
    name: form.name,
    nameEn: form.nameEn,
    label: form.label,
    labelEn: form.labelEn,
    icon: form.icon,
    description: form.description,
    descriptionEn: form.descriptionEn,
    order: form.order,
    processType: form.processType,
    isFrontend: form.isFrontend,
    input$$: toServerPorts(form.input$),
    output$$: toServerPorts(form.output$),
    config$$: toServerConfigs(form.config$),
});
