import { GraphPanelProps } from '../../../interfaces/renderer/project/graph';
import { useCytoscapeGraph } from '../../hooks/project/useCytoscapeGraph';
import { GraphLegend, LayoutControls, MinReferencesFilter } from './GraphControls';

export function GraphPanel({
  nodes, edges, loading, hasSyncedData,
  layout, minDocs, hiddenTypes, theme,
  onLayoutChange, onMinDocsChange, onToggleHiddenType, onNodeClick, onExpand,
}: Readonly<GraphPanelProps>) {
  const hasData = nodes.length > 0;
  const { containerRef, tooltipRef, cyRef } = useCytoscapeGraph({
    enabled: true, nodes, edges, layout, theme, hiddenTypes, onNodeClick,
  });

  return (
    <section className="project-panel" id="graph-panel">
      <div className="panel-header">
        <div className="panel-title-group">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="3" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="15" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="3" cy="15" r="1.5" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="15" cy="15" r="1.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M4.5 4.5L6.5 6.5M11.5 6.5L13.5 4.5M4.5 13.5L6.5 11.5M11.5 11.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <h2>Relationship Graph</h2>
        </div>

        {(hasSyncedData || hasData) && (
          <MinReferencesFilter id="graph-min-docs" value={minDocs} onChange={onMinDocsChange} />
        )}

        {hasData && (
          <div className="graph-controls">
            <LayoutControls layout={layout} cyRef={cyRef} onLayoutChange={onLayoutChange} />
            <button className="btn-icon" title="Expand to full screen" onClick={onExpand}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="panel-loading">
          <div className="spinner"></div>
          <span>Loading graph…</span>
        </div>
      )}

      {!loading && !hasData && (
        <div className="panel-placeholder">
          <svg aria-hidden="true" width="40" height="40" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="5" stroke="#d1d5db" strokeWidth="2" />
            <circle cx="6" cy="8" r="3" stroke="#d1d5db" strokeWidth="1.5" />
            <circle cx="34" cy="8" r="3" stroke="#d1d5db" strokeWidth="1.5" />
            <circle cx="6" cy="32" r="3" stroke="#d1d5db" strokeWidth="1.5" />
            <circle cx="34" cy="32" r="3" stroke="#d1d5db" strokeWidth="1.5" />
            <line x1="9" y1="10" x2="15.5" y2="15.5" stroke="#d1d5db" strokeWidth="1.5" />
            <line x1="31" y1="10" x2="24.5" y2="15.5" stroke="#d1d5db" strokeWidth="1.5" />
            <line x1="9" y1="30" x2="15.5" y2="24.5" stroke="#d1d5db" strokeWidth="1.5" />
            <line x1="31" y1="30" x2="24.5" y2="24.5" stroke="#d1d5db" strokeWidth="1.5" />
          </svg>
          <p className="placeholder-title">No analysed documents yet</p>
          <p className="placeholder-sub">Entity and relationship graphs will appear here once documents are analysed.</p>
        </div>
      )}

      <div ref={containerRef} className={`graph-canvas${hasData && !loading ? '' : ' hidden'}`}></div>

      {hasData && (
        <GraphLegend nodes={nodes} hiddenTypes={hiddenTypes} theme={theme} onToggleHiddenType={onToggleHiddenType} />
      )}

      <div ref={tooltipRef} className="graph-tooltip hidden"></div>
    </section>
  );
}
