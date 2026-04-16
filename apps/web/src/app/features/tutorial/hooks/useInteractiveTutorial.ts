import { useCallback, useEffect, useRef, useState } from 'react';

import { useCanvasStore } from '@flows/flows';

import { generateTempId } from '../../flows/utils';
import {
    INTERACTIVE_TUTORIAL_STEPS,
    INTERACTIVE_TUTORIAL_STORAGE_KEY,
    TUTORIAL_BLOCK_TYPES,
    TUTORIAL_NODE_POSITIONS,
} from '../consts/interactiveTutorialSteps';

import type { WorkflowCanvasRef } from '../../flows';
import type { SidebarRef } from '../../flows';

/** Placeholder image for simulated AI generation */
const MOCK_IMAGE_DATA_URL =
    'data:image/svg+xml,' +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">' +
            '<rect width="256" height="256" fill="#f3e8ff"/>' +
            '<text x="128" y="120" text-anchor="middle" font-size="48">🎨</text>' +
            '<text x="128" y="160" text-anchor="middle" font-size="14" fill="#8F19F6">AI Generated</text>' +
            '</svg>'
    );

interface UseInteractiveTutorialOptions {
    canvasRef: React.RefObject<WorkflowCanvasRef | null>;
    sidebarRef: React.RefObject<SidebarRef | null>;
    onComplete?: () => void;
}

export const useInteractiveTutorial = ({ canvasRef, sidebarRef, onComplete }: UseInteractiveTutorialOptions) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const nodeIdsRef = useRef<{ textInput?: string; aiImage?: string; preview?: string }>({});

    const steps = INTERACTIVE_TUTORIAL_STEPS;
    const step = steps[currentStep];
    const totalSteps = steps.length;

    // ─── Step ENTER effects ───
    // Canvas actions happen HERE (when entering a step), not on button click
    useEffect(() => {
        if (!step) return;
        const canvas = canvasRef.current;
        const { addConnection } = useCanvasStore.getState();

        switch (step.id) {
            case 'intro':
                sidebarRef.current?.open();
                break;

            case 'select-text-input':
                sidebarRef.current?.open();
                break;

            // Step entered after user clicked "선택" on select-text-input
            case 'text-input-added': {
                sidebarRef.current?.close();
                if (!canvas) break;
                canvas.addNode(TUTORIAL_BLOCK_TYPES.textInput, TUTORIAL_NODE_POSITIONS.textInput);
                // Capture the new node ID
                const nodesAfterText = useCanvasStore.getState().nodes;
                const textNode = nodesAfterText[nodesAfterText.length - 1];
                if (textNode) {
                    nodeIdsRef.current.textInput = textNode.id;
                    canvas.selectNode(textNode.id);
                }
                break;
            }

            case 'enter-text':
                // Node is on canvas, detail panel should be open via selectNode
                break;

            case 'select-ai-image':
                sidebarRef.current?.open();
                // Deselect current node
                canvas?.selectNode(null);
                break;

            // Step entered after user clicked "선택" on select-ai-image
            case 'ai-image-connected': {
                sidebarRef.current?.close();
                if (!canvas) break;
                canvas.addNode(TUTORIAL_BLOCK_TYPES.aiImage, TUTORIAL_NODE_POSITIONS.aiImage);
                const nodesAfterAi = useCanvasStore.getState().nodes;
                const aiNode = nodesAfterAi[nodesAfterAi.length - 1];
                if (aiNode) {
                    nodeIdsRef.current.aiImage = aiNode.id;
                    // Auto-connect text input → AI image
                    if (nodeIdsRef.current.textInput) {
                        addConnection({
                            id: generateTempId('edge'),
                            sourceNodeId: nodeIdsRef.current.textInput,
                            sourcePortId: 'out',
                            targetNodeId: aiNode.id,
                            targetPortId: 'prompt',
                        });
                    }
                    canvas.selectNode(aiNode.id);
                }
                break;
            }

            case 'select-model':
                // Detail panel already open from ai-image-connected
                break;

            case 'run-node':
                canvas?.selectNode(null);
                break;

            // Step entered after user clicked "실행"
            case 'generating': {
                if (!canvas) break;
                const aiNodeId = nodeIdsRef.current.aiImage;
                if (aiNodeId) {
                    canvas.updateNode(aiNodeId, { status: 'RUNNING' });
                    setTimeout(() => {
                        canvas.updateNode(aiNodeId, {
                            status: 'COMPLETED',
                            outputData: {
                                out: { type: 'image', value: MOCK_IMAGE_DATA_URL, timestamp: Date.now() },
                            },
                        });
                    }, 2500);
                }
                break;
            }

            case 'select-preview':
                sidebarRef.current?.open();
                break;

            // Step entered after user clicked "선택" on select-preview
            case 'all-connected': {
                sidebarRef.current?.close();
                if (!canvas) break;
                canvas.addNode(TUTORIAL_BLOCK_TYPES.preview, TUTORIAL_NODE_POSITIONS.preview);
                const nodesAfterPreview = useCanvasStore.getState().nodes;
                const previewNode = nodesAfterPreview[nodesAfterPreview.length - 1];
                if (previewNode) {
                    nodeIdsRef.current.preview = previewNode.id;
                    if (nodeIdsRef.current.aiImage) {
                        addConnection({
                            id: generateTempId('edge'),
                            sourceNodeId: nodeIdsRef.current.aiImage,
                            sourcePortId: 'out',
                            targetNodeId: previewNode.id,
                            targetPortId: 'in',
                        });
                    }
                }
                break;
            }

            case 'complete':
                sidebarRef.current?.close();
                canvas?.selectNode(null);
                break;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentStep]);

    // Auto-advance for 'auto' action steps
    useEffect(() => {
        if (!step || step.action !== 'auto' || !step.autoAdvanceMs) return;
        const timer = setTimeout(() => {
            setCurrentStep(prev => Math.min(prev + 1, totalSteps - 1));
        }, step.autoAdvanceMs);
        return () => clearTimeout(timer);
    }, [step, totalSteps]);

    // ─── Navigation ───
    const next = useCallback(() => {
        if (currentStep >= totalSteps - 1) {
            localStorage.setItem(INTERACTIVE_TUTORIAL_STORAGE_KEY, 'true');
            onComplete?.();
            return;
        }
        setCurrentStep(prev => prev + 1);
    }, [currentStep, totalSteps, onComplete]);

    const prev = useCallback(() => {
        if (step?.id === 'intro') {
            localStorage.setItem(INTERACTIVE_TUTORIAL_STORAGE_KEY, 'true');
            onComplete?.();
            return;
        }
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
        }
    }, [currentStep, step?.id, onComplete]);

    const requestClose = useCallback(() => {
        setShowConfirmDialog(true);
    }, []);

    const cancelClose = useCallback(() => {
        setShowConfirmDialog(false);
    }, []);

    const close = useCallback(() => {
        setShowConfirmDialog(false);
    }, []);

    const complete = useCallback(() => {
        localStorage.setItem(INTERACTIVE_TUTORIAL_STORAGE_KEY, 'true');
        onComplete?.();
    }, [onComplete]);

    return {
        step,
        currentStep,
        totalSteps,
        showConfirmDialog,
        next,
        prev,
        close,
        requestClose,
        cancelClose,
        complete,
    };
};
