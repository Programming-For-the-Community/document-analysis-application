import { useRef, useEffect, useState } from 'react';

import { GRAPH_LAYOUTS } from '../../../constants/renderer/project/graph';
import { GraphPanelProps } from '../../../interfaces/renderer/project/graph';
import {
  CyInstance, createCytoscape, wireGraphHover,
  applyTypeFilters, createCenteringResizeObserver,
  getEntityColors, getLayoutConfig, getGraphStyle,
} from '../../../utils/renderer/graph';

export function GraphPanel({
  nodes, edges, loading, hasSyncedData,
  layout, minDocs, hiddenTypes, theme,
  onLayoutChange, onMinDocsChange, onToggleHiddenType, onNodeClick, onExpand,
}: GraphPanelProps) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const cyRef           = useRef<CyInstance | null>(null);
  const observerRef     = useRef<ResizeObserver | null>(null);
  const tooltipRef      = useRef<HTMLDivElement>(null);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [infoPopupOpen, setInfoPopupOpen]   = useState(false);

  const hasData = nodes.length > 0;

  // Create / destroy cytoscape when the node/edge data changes
  useEffect(() => {
    if (!containerRef.current || !hasData) return;
    cyRef.current?.destroy();
    observerRef.current?.disconnect();

    const cy = createCytoscape(containerRef.current, nodes, edges, layout, theme);
    cyRef.current = cy;

    wireGraphHover(cy, containerRef.current, tooltipRef.current);
    cy.on('tap', 'node', (e) => {
      tooltipRef.current?.classList.add('hidden');
      cy.elements().removeClass('faded labelled');
      onNodeClick(String(e.target.data('label')), String(e.target.data('type')));
    });

    applyTypeFilters(cy, hiddenTypes);
    observerRef.current = createCenteringResizeObserver(cy, containerRef.current);

    return () => {
      cy.destroy();
      observerRef.current?.disconnect();
      cyRef.current = null;
    };
  // theme/hiddenTypes are intentionally excluded — the effects below apply them
  // to the existing instance without a full recreation. layout is only the
  // initial layout for a fresh instance; switching layouts later calls
  // cy.layout().run() directly (see layout-picker-item onClick) instead of
  // recreating the graph.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  // Re-style when theme changes without recreating
  useEffect(() => {
    cyRef.current?.style(getGraphStyle(theme));
  }, [theme]);

  // Apply/remove type filters when hiddenTypes changes
  useEffect(() => {
    if (cyRef.current) applyTypeFilters(cyRef.current, hiddenTypes);
  }, [hiddenTypes]);

  const typesPresent = [...new Set(nodes.map(n => n.data.type))].sort();
  const colors = getEntityColors(theme);

  return (
    <section className="project-panel" id="graph-panel">
      <div className="panel-header">
        <div className="panel-title-group">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
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
          <div className="graph-filter-group">
            <label className="graph-filter-label">Min References</label>
            <div className="graph-filter-box">
              <input type="number" className="graph-filter-input" min="2" value={minDocs}
                onChange={e => onMinDocsChange(parseInt(e.target.value, 10))} />
              <div className="graph-filter-spinners">
                <button className="graph-filter-spin-btn" tabIndex={-1} onClick={() => onMinDocsChange(minDocs + 1)}>
                  <svg width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 4l3-3 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <button className="graph-filter-spin-btn" tabIndex={-1} onClick={() => onMinDocsChange(Math.max(2, minDocs - 1))}>
                  <svg width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {hasData && (
          <div className="graph-controls">
            <div className="layout-picker">
              <button className="layout-picker-btn" onClick={() => setLayoutMenuOpen(o => !o)}>
                <span>{layout}</span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              {layoutMenuOpen && (
                <div className="layout-picker-menu" onClick={() => setLayoutMenuOpen(false)}>
                  {[...GRAPH_LAYOUTS.keys()].map(name => (
                    <div key={name} className={`layout-picker-item${layout === name ? ' active' : ''}`}
                      onClick={() => { onLayoutChange(name); cyRef.current?.layout(getLayoutConfig(name)).run(); }}>
                      {name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="layout-info-anchor">
              <button className="btn-icon" onClick={e => { e.stopPropagation(); setInfoPopupOpen(o => !o); }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M7 6.5v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <circle cx="7" cy="3.8" r="0.85" fill="currentColor" />
                </svg>
              </button>
              {infoPopupOpen && (
                <div className="layout-info-popup">
                  <div className="layout-info-header">
                    <span className="layout-info-title">Layout Options</span>
                    <button className="layout-info-close" onClick={() => setInfoPopupOpen(false)}>&times;</button>
                  </div>
                  <div className="layout-info-body">
                    {[...GRAPH_LAYOUTS.entries()].map(([name, { description }]) => (
                      <div key={name} className="layout-info-row">
                        <span className="layout-info-name">{name}</span>
                        <span className="layout-info-desc">{description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button className="btn-icon" title="Fit graph to view" onClick={() => cyRef.current?.fit(undefined, 24)}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M7 1v2M7 11v2M1 7h2M11 7h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
            <button className="btn-icon" title="Expand to full screen" onClick={onExpand}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
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
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
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

      {hasData && typesPresent.length > 0 && (
        <div className="graph-legend">
          {typesPresent.map(type => {
            const color = colors[type as keyof typeof colors] ?? colors['Other'];
            return (
              <div key={type} className={`graph-legend-item${hiddenTypes.has(type) ? ' muted' : ''}`}
                title={`Click to show/hide ${type} nodes`} onClick={() => onToggleHiddenType(type)}>
                <span className="graph-legend-swatch" style={{ background: color }}></span>
                <span className="graph-legend-label">{type}</span>
              </div>
            );
          })}
        </div>
      )}

      <div ref={tooltipRef} className="graph-tooltip hidden"></div>
    </section>
  );
}