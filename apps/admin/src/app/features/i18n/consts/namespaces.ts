export const I18N_NAMESPACES = ['common', 'flows', 'nodes', 'landing', 'tutorial'] as const;

export type I18nNamespace = (typeof I18N_NAMESPACES)[number];
