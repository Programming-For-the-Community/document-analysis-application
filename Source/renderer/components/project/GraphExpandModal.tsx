import { GraphExpandModalProps } from '../../../interfaces/renderer/project/graph';
import { useCytoscapeGraph } from '../../hooks/project/useCytoscapeGraph';
import { ModalOverlay } from '../ModalOverlay';
import { GraphLegend, LayoutControls, MinReferencesFilter } from './GraphControls';

export function GraphExpandModal({
  isOpen, nodes, edges, layout, minDocs, hiddenTypes, theme,
  onClose, onLayoutChange, onMinDocsChange, onToggleHiddenType, onNodeClick,
}: Readonly<GraphExpandModalProps>) {
  const { containerRef, tooltipRef, cyRef } = useCytoscapeGraph({
    enabled: isOpen, nodes, edges, layout, theme, hiddenTypes, onNodeClick,
  });

  if (!isOpen) return null;

  return (
    <ModalOverlay className="graph-expand-overlay" onClose={onClose}>
      <div className="graph-expand-modal">
        <div className="graph-expand-header">
          <span className="graph-expand-title">Relationship Graph</span>
          <div className="graph-expand-header-controls">
            <MinReferencesFilter id="graph-expand-min-docs" value={minDocs} onChange={onMinDocsChange} />
            <LayoutControls layout={layout} cyRef={cyRef} onLayoutChange={onLayoutChange} />
            <button className="btn-icon-danger" title="Close" onClick={onClose}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="graph-expand-body">
          <div ref={containerRef} className="graph-expand-canvas"></div>
          <GraphLegend nodes={nodes} hiddenTypes={hiddenTypes} theme={theme} onToggleHiddenType={onToggleHiddenType} />
        </div>
      </div>
      <div ref={tooltipRef} className="graph-tooltip hidden"></div>
    </ModalOverlay>
  );
}
