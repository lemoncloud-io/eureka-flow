import * as React from 'react';

import { cn } from '../../utils/index';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
    ({ className, ...props }, ref) => {
        const internalRef = React.useRef<HTMLTextAreaElement>(null);

        // ref를 외부 ref와 합치기
        const combinedRef = (el: HTMLTextAreaElement) => {
            internalRef.current = el;
            if (typeof ref === 'function') ref(el);
            else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
        };

        const handleInput = () => {
            if (internalRef.current) {
                internalRef.current.style.height = 'auto'; // 기존 높이 초기화
                internalRef.current.style.height = internalRef.current.scrollHeight + 'px'; // 내용 높이 반영
            }
        };
        return (
            <textarea
                {...props}
                ref={combinedRef}
                onInput={e => {
                    handleInput();
                    if (props.onInput) props.onInput(e); // 기존 onInput도 호출
                }}
                className={cn(
                    'flex min-h-[60px] w-full rounded-md border border-gray-400 bg-transparent px-5 py-4 text-base font-medium resize-none placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                    className
                )}
            />
        );
    }
);
Textarea.displayName = 'Textarea';

export { Textarea };
