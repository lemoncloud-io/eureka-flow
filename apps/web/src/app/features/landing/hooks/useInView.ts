import { useEffect, useRef, useState } from 'react';

const THRESHOLD = 0.1;

export const useInView = <T extends HTMLElement = HTMLDivElement>(): {
    ref: React.RefObject<T | null>;
    isInView: boolean;
} => {
    const ref = useRef<T | null>(null);
    const [isInView, setIsInView] = useState(false);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) {
            setIsInView(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsInView(true);
                    observer.unobserve(element);
                }
            },
            { threshold: THRESHOLD }
        );

        observer.observe(element);

        return () => observer.disconnect();
    }, []);

    return { ref, isInView };
};
