import { cn } from '@flows/ui-kit';

/**
 * Amber credit-coin glyph shown next to credit amounts. Ported from billing-front's
 * CreditCoin so the credit token reads the same across flow and billing.
 */
export const CreditCoin = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" className={cn('h-5 w-5', className)} aria-hidden>
        <rect x="2" y="6" width="20" height="12" rx="3" fill="#FBBF24" />
        <rect x="2" y="6" width="20" height="12" rx="3" stroke="#F59E0B" strokeWidth="1" />
        <path d="M9 12l2 2 4-4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);
