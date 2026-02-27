import { useState, useCallback } from 'react';

export const useAudioProcessor = () => {
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
        isProcessing,
        processAudio
    };
};