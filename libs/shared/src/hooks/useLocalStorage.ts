import { useCallback, useEffect, useState } from 'react';

/**
 * Hook to sync state with localStorage
 *
 * @template T - Type of the stored value
 * @param key - localStorage key
 * @param initialValue - Initial value if key doesn't exist
 * @returns Tuple of [value, setValue]
 */
export const useLocalStorage = <T>(key: string, initialValue: T): [T, (value: T) => void] => {
    const [storedValue, setStoredValue] = useState<T>(() => {
        try {
            const item = window.localStorage.getItem(key);
            return item ? (JSON.parse(item) as T) : initialValue;
        } catch (error) {
            console.error(`Error reading localStorage key "${key}":`, error);
            return initialValue;
        }
    });

    const setValue = useCallback(
        (value: T) => {
            try {
                setStoredValue(value);
                window.localStorage.setItem(key, JSON.stringify(value));
            } catch (error) {
                console.error(`Error setting localStorage key "${key}":`, error);
            }
        },
        [key]
    );

    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === key && e.newValue) {
                try {
                    setStoredValue(JSON.parse(e.newValue) as T);
                } catch (error) {
                    console.error(`Error parsing localStorage change for key "${key}":`, error);
                }
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [key]);

    return [storedValue, setValue];
};
