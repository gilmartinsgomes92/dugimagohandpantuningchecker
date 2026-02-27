import { useState, useCallback } from 'react';
import type { TunerData } from '../types';

export const useAudioProcessor = () => {
    const [tunerData, setTunerData] = useState<TunerData | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const processAudio = useCallback((audioData: Float32Array) => {
        setIsProcessing(true);
        try {
            // Process audio data here
            console.log('Processing audio:', audioData);
        } finally {
            setIsProcessing(false);
        }
    }, []);

    return {
        tunerData,
        isProcessing,
        processAudio
    };
};