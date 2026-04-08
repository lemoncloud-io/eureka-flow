const STAGE = process.env.STAGE || 'local';

export const log = {
    info: (msg: string, data?: unknown) => {
        console.log(JSON.stringify({ level: 'INFO', stage: STAGE, msg, ...(data ? { data } : {}) }));
    },
    warn: (msg: string, data?: unknown) => {
        console.warn(JSON.stringify({ level: 'WARN', stage: STAGE, msg, ...(data ? { data } : {}) }));
    },
    error: (msg: string, error?: unknown) => {
        const errData =
            error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error;
        console.error(JSON.stringify({ level: 'ERROR', stage: STAGE, msg, error: errData }));
    },
};
