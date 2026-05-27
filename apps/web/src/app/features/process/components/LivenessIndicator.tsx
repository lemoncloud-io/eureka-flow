import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useQueryClient } from '@tanstack/react-query';

import { itemKeys } from '@flows/flows';

import type { TFunction } from 'i18next';

const formatRelativeTime = (ms: number, t: TFunction): string => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 5) return t('navigator.justNow', 'Just now');
    if (seconds < 60) return t('navigator.secondsAgo', { count: seconds, defaultValue: '{{count}}s ago' });
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return t('navigator.minutesAgo', { count: minutes, defaultValue: '{{count}}m ago' });
    return t('navigator.longAgo', 'a while ago');
};

export const LivenessIndicator = () => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [, setTick] = useState(false);

    useEffect(() => {
        const interval = setInterval(() => setTick(v => !v), 10_000);
        return () => clearInterval(interval);
    }, []);

    const queryState = queryClient.getQueryState(itemKeys.lists());
    const updatedAt = queryState?.dataUpdatedAt;

    if (!updatedAt) return null;

    const elapsed = Date.now() - updatedAt;
    const text = formatRelativeTime(elapsed, t);

    return <span className="text-[10px] text-muted-foreground/60 hidden sm:inline">{text}</span>;
};
