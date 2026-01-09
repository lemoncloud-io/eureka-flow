import React, { useState, useMemo } from 'react';
import { BLOCK_REGISTRY } from '../constants';

interface SidebarProps {
  onAddNode: (type: string) => void;
  isLoading?: boolean;
}

// Extracted component to avoid re-mounting on parent state updates
const NodeButton = ({ 
    type, 
    icon, 
    label, 
    isCollapsed, 
    disabled, 
    onAddNode, 
    onHover, 
    onLeave,
    colorClass = "bg-gray-800 border-gray-700 hover:bg-gray-700" 
}: {
    type: string;
    icon: string;
    label: string;
    isCollapsed: boolean;
    disabled?: boolean;
    onAddNode: (type: string) => void;
    onHover: (type: string, top: number) => void;
    onLeave: () => void;
    colorClass?: string;
}) => (
    <button 
        onClick={() => onAddNode(type)} 
        onMouseEnter={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            onHover(type, rect.top);
        }}
        onMouseLeave={onLeave}
        disabled={disabled}
        className={`
            w-full p-2 rounded border text-sm transition-colors flex items-center
            ${colorClass}
            ${isCollapsed ? 'justify-center' : 'justify-start gap-2'}
            disabled:opacity-50 disabled:cursor-not-allowed
            relative group
        `}
    >
        <span className="text-lg">{icon}</span>
        {!isCollapsed && <span>{label}</span>}
    </button>
);

export const Sidebar: React.FC<SidebarProps> = ({ 
  onAddNode, isLoading 
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<{ type: string; top: number } | null>(null);

  const SectionHeader = ({ title }: { title: string }) => (
      !isCollapsed ? (
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4 first:mt-0 px-1">{title}</h3>
      ) : (
        <div className="h-px bg-gray-800 my-2 mx-1" /> // Divider when collapsed
      )
  );
  
  const handleHover = (type: string, top: number) => setHoveredNode({ type, top });
  const handleLeave = () => setHoveredNode(null);

  // Helper to map type to icon
  const getIcon = (type: string) => {
    type = type ?? '';
      if (type.startsWith('input-')) return type.includes('text') ? '🔤' : '🖼️';
      if (type.includes('validation')) return '🛡️';
      if (type === 'buffer') return '⏳';
      if (type.includes('transform')) return '🔄';
      if (type.includes('info')) return '📏';
      if (type === 'workflow-component') return '📦';
      if (type === 'preview') return '👁️';
      if (type === 'debug-log') return '📟';
      return type || '🧩';
  };

  // Group blocks dynamically
  const blockGroups = useMemo(() => {
      const blocks = Object.values(BLOCK_REGISTRY);
      return {
          inputs: blocks.filter(b => b.type.startsWith('input-')),
          process: blocks.filter(b => !b.type.startsWith('input-') && !['preview', 'debug-log'].includes(b.type)),
          outputs: blocks.filter(b => ['preview', 'debug-log'].includes(b.type)),
      };
  }, [BLOCK_REGISTRY]); // Re-compute if registry changes (mostly stable)

  // Render Tooltip
  const renderTooltip = () => {
      if (!hoveredNode) return null;
      const def = BLOCK_REGISTRY[hoveredNode.type];
      if (!def) return null;

      const leftPos = isCollapsed ? '4.5rem' : '15.5rem'; // w-16 is 4rem, w-60 is 15rem. Add some gap.

      return (
          <div 
            className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-4 w-64 pointer-events-none animate-in fade-in slide-in-from-left-2 duration-200"
            style={{ 
                top: hoveredNode.top, 
                left: leftPos 
            }}
          >
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-800">
                  <span className="font-bold text-white text-sm">{def.label}</span>
                  <span className="text-[9px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded border border-gray-700 font-mono">{def.type}</span>
              </div>
              
              <p className="text-xs text-gray-300 mb-3 leading-relaxed">
                  {def.description}
              </p>

              {(def.inputs.length > 0 || def.outputs.length > 0) && (
                  <div className="space-y-2">
                      {def.inputs.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                              <span className="text-[9px] text-gray-500 uppercase font-bold mr-1">In:</span>
                              {def.inputs.map(i => (
                                  <span key={i.id} className="text-[9px] bg-gray-800 text-blue-300 px-1.5 rounded border border-gray-700">
                                      {i.label} <span className="opacity-50">({i.type})</span>
                                  </span>
                              ))}
                          </div>
                      )}
                      {def.outputs.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                              <span className="text-[9px] text-gray-500 uppercase font-bold mr-1">Out:</span>
                              {def.outputs.map(o => (
                                  <span key={o.id} className="text-[9px] bg-gray-800 text-green-300 px-1.5 rounded border border-gray-700">
                                      {o.label} <span className="opacity-50">({o.type})</span>
                                  </span>
                              ))}
                          </div>
                      )}
                  </div>
              )}
          </div>
      );
  };

  return (
    <div 
        className={`
            relative bg-gray-900 border-r border-gray-800 flex flex-col h-full z-20 shadow-lg 
            transition-all duration-300 ease-in-out shrink-0
            ${isCollapsed ? 'w-16' : 'w-60'}
        `}
    >
      {/* Toggle Button */}
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-4 bg-gray-800 border border-gray-600 rounded-full w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 z-50 text-[10px] shadow-md transition-colors"
        title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
      >
        {isCollapsed ? '❯' : '❮'}
      </button>

      {/* Header - Simple label */}
      <div className={`p-4 border-b border-gray-800 flex items-center justify-center`}>
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
            {isCollapsed ? 'Lib' : 'Library'}
          </span>
      </div>
      
      {/* Node Library */}
      <div 
        className={`flex-1 overflow-y-auto ${isCollapsed ? 'p-2 space-y-2' : 'p-4 space-y-1'}`}
        onScroll={() => setHoveredNode(null)}
      >
        
        <div>
            <SectionHeader title="Inputs" />
            <div className="space-y-2">
                {blockGroups.inputs.map(b => (
                    <NodeButton 
                        key={b.type}
                        type={b.type} 
                        icon={getIcon(b.icon ?? b.type)} 
                        label={b.label} 
                        isCollapsed={isCollapsed} 
                        disabled={isLoading} 
                        onAddNode={onAddNode} 
                        onHover={handleHover} 
                        onLeave={handleLeave} 
                    />
                ))}
            </div>
        </div>

        <div>
            <SectionHeader title="Process" />
            <div className="space-y-2">
                {blockGroups.process.map(b => (
                    <NodeButton 
                        key={b.type}
                        type={b.type} 
                        icon={getIcon(b?.icon ?? b.type)} 
                        label={b.label} 
                        isCollapsed={isCollapsed} 
                        disabled={isLoading} 
                        onAddNode={onAddNode} 
                        onHover={handleHover} 
                        onLeave={handleLeave}
                        colorClass={b.type === 'workflow-component' ? "bg-indigo-900/50 hover:bg-indigo-900/80 border-indigo-700 text-indigo-100" : undefined}
                    />
                ))}
            </div>
        </div>

        <div>
            <SectionHeader title="Output" />
            <div className="space-y-2">
                {blockGroups.outputs.map(b => (
                    <NodeButton 
                        key={b.type}
                        type={b.type} 
                        icon={getIcon(b?.icon ?? b.type)} 
                        label={b.label} 
                        isCollapsed={isCollapsed} 
                        disabled={isLoading} 
                        onAddNode={onAddNode} 
                        onHover={handleHover} 
                        onLeave={handleLeave} 
                    />
                ))}
            </div>
        </div>
      </div>

      {/* Footer */}
      {!isCollapsed && (
          <div className="p-4 border-t border-gray-800 text-[10px] text-gray-600 text-center">
            Drag & Drop nodes to canvas
          </div>
      )}

      {/* Tooltip Rendered Portal-like (fixed position) */}
      {renderTooltip()}
    </div>
  );
};