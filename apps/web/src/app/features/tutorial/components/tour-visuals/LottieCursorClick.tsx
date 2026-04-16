import React from 'react';

import Lottie from 'lottie-react';

import cursorClickData from '../../assets/cursor-click.json';

export const LottieCursorClick: React.FC = () => (
    <Lottie animationData={cursorClickData} loop className="h-[120px] w-[120px]" />
);
