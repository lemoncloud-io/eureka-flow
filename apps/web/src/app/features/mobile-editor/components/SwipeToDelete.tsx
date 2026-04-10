import { useCallback, useRef, useState } from 'react';

import { Trash2 } from 'lucide-react';

import { cn } from '@flows/lib/utils';

interface SwipeToDeleteProps {
    children: React.ReactNode;
    onDelete: () => void;
    disabled?: boolean;
}

const THRESHOLD = 80;
const DELETE_BUTTON_W = 72;

export const SwipeToDelete = ({ children, onDelete, disabled }: SwipeToDeleteProps) => {
    const [offsetX, setOffsetX] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const offsetRef = useRef(0);
    const touchRef = useRef<{
        startX: number;
        startY: number;
        startOffset: number;
        directionLocked: boolean;
    } | null>(null);

    const isRevealed = offsetX <= -DELETE_BUTTON_W;

    const handleTouchStart = useCallback(
        (e: React.TouchEvent) => {
            if (disabled) return;
            touchRef.current = {
                startX: e.touches[0].clientX,
                startY: e.touches[0].clientY,
                startOffset: offsetRef.current <= -DELETE_BUTTON_W ? -DELETE_BUTTON_W : 0,
                directionLocked: false,
            };
            setIsDragging(true);
        },
        [disabled]
    );

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!touchRef.current) return;

        const dx = e.touches[0].clientX - touchRef.current.startX;
        const dy = e.touches[0].clientY - touchRef.current.startY;

        if (!touchRef.current.directionLocked) {
            if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
            if (Math.abs(dy) > Math.abs(dx)) {
                touchRef.current = null;
                setIsDragging(false);
                return;
            }
            touchRef.current.directionLocked = true;
        }

        e.preventDefault();
        const newOffset = Math.min(0, Math.max(-DELETE_BUTTON_W - 20, touchRef.current.startOffset + dx));
        offsetRef.current = newOffset;
        setOffsetX(newOffset);
    }, []);

    const handleTouchEnd = useCallback(() => {
        if (!touchRef.current) {
            setIsDragging(false);
            return;
        }

        const current = offsetRef.current;
        const snapped = Math.abs(current) > THRESHOLD ? -DELETE_BUTTON_W : 0;
        offsetRef.current = snapped;
        setOffsetX(snapped);
        setIsDragging(false);
        touchRef.current = null;
    }, []);

    const handleDelete = useCallback(() => {
        offsetRef.current = -300;
        setOffsetX(-300);
        setTimeout(() => onDelete(), 200);
    }, [onDelete]);

    const handleCloseSwipe = useCallback(() => {
        offsetRef.current = 0;
        setOffsetX(0);
    }, []);

    return (
        <div className="relative overflow-hidden rounded-lg">
            {/* Delete button behind */}
            <div
                className={cn(
                    'absolute right-0 top-0 bottom-0 flex items-center justify-center',
                    'bg-destructive text-destructive-foreground transition-opacity duration-150',
                    offsetX < -10 ? 'opacity-100' : 'opacity-0'
                )}
                style={{ width: DELETE_BUTTON_W }}
            >
                <button
                    onClick={handleDelete}
                    className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
                >
                    <Trash2 className="w-5 h-5" />
                    <span className="text-[10px] font-medium">Delete</span>
                </button>
            </div>

            {/* Swipeable content */}
            <div
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onClick={isRevealed ? handleCloseSwipe : undefined}
                style={{
                    transform: `translateX(${offsetX}px)`,
                    transition: isDragging ? 'none' : 'transform 0.2s ease-out',
                }}
            >
                {children}
            </div>
        </div>
    );
};
