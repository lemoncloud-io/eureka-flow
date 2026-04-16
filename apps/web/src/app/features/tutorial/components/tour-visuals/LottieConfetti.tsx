import React from 'react';

import Lottie from 'lottie-react';

import confettiData from '../../assets/confetti.json';

export const LottieConfetti: React.FC = () => (
    <Lottie animationData={confettiData} loop={false} className="h-[140px] w-[140px]" />
);
