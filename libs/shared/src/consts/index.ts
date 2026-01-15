/**
 * Error type-specific translation keys
 * Used by ErrorFallback and RouterErrorFallback components
 * Components should use these keys with t() function from react-i18next
 */
export const ERROR_MESSAGE_KEYS = {
    network: {
        title: 'common:errors.network.title',
        description: 'common:errors.network.description',
        primaryAction: 'common:actions.retry',
        secondaryAction: 'common:actions.refresh',
    },
    auth: {
        title: 'common:errors.auth.title',
        description: 'common:errors.auth.description',
        primaryAction: 'common:actions.login',
        secondaryAction: 'common:actions.goHome',
    },
    server: {
        title: 'common:errors.server.title',
        description: 'common:errors.server.description',
        primaryAction: 'common:actions.retry',
        secondaryAction: 'common:actions.goHome',
    },
    client: {
        title: 'common:errors.client.title',
        description: 'common:errors.client.description',
        primaryAction: 'common:actions.retry',
        secondaryAction: 'common:actions.goHome',
    },
    unknown: {
        title: 'common:errors.unknown.title',
        description: 'common:errors.unknown.description',
        primaryAction: 'common:actions.retry',
        secondaryAction: 'common:actions.goHome',
    },
    notFound: {
        title: 'common:errors.notFound.title',
        description: 'common:errors.notFound.description',
        primaryAction: 'common:actions.goHome',
        secondaryAction: 'common:actions.goBack',
    },
} as const;

export type ErrorMessageType = keyof typeof ERROR_MESSAGE_KEYS;
