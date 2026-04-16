import React from 'react';

/** Eureka Flow logo used in tour intro/welcome screens */
export const EurekaFlowLogo: React.FC = () => (
    <div className="flex items-center gap-1.5">
        <img src="/logo/purple-symbol.png" alt="Eureka" className="h-10 w-10" />
        <span className="text-2xl font-bold tracking-tight text-primary">Flow</span>
    </div>
);
