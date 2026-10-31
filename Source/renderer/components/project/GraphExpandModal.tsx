import { useRef, useEffect, useState } from 'react';
import { GraphExpandModalProps } from '../../../interfaces/renderer/project/graph';
import { GRAPH_LAYOUTS } from '../../../constants/renderer/project/graph';
import {
  CyInstance, createCytoscape, wireGraphHover,
  applyTypeFilters, createCenteringResizeObserver,
  getEntityColors, getLayoutConfig, getGraphStyle,
} from '../../../utils/renderer/graph';
import { ModalOverlay } from '../ModalOverlay';

export function GraphExpandModal({
  isOpen, nodes, edges, layout, minDocs, hiddenTypes, theme,
  onClose, onLayoutChange, onMinDocsChange, onToggleHiddenType, onNodeClick,
}: Readonly<GraphExpandModalProps>) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const cyRef         = useRef<CyInstance | null>(null);
  const observerRef   = useRef<ResizeObserver | null>(null);
  const tooltipRef    = useRef<HTMLDivElement>(null);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [infoPopupOpen, setInfoPopupOpen]   = useState(false);

  useEffect(() => {
    if (!isOpen || !containerRef.current || !nodes.length) return;
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

    return () => { cy.destroy(); observerRef.current?.disconnect(); cyRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, nodes, edges]);

  useEffect(() => { cyRef.current?.style(getGraphStyle(theme)); }, [theme]);
  useEffect(() => { if (cyRef.current) applyTypeFilters(cyRef.current, hiddenTypes); }, [hiddenTypes]);

  if (!isOpen) return null;

  function selectLayout(name: string) {
    setLayoutMenuOpen(false);
    onLayoutChange(name);
    cyRef.current?.layout(getLayoutConfig(name)).run();
  }

  const typesPresent = [...new Set(nodes.map(n => n.data.type))].sort((a, b) => a.localeCompare(b));
  const colors = getEntityColors(theme);

  return (
    <ModalOverlay className="graph-expand-overlay" onClose={onClose}>
      <div className="graph-expand-modal">
        <div className="graph-expand-header">
          <span className="graph-expand-title">Relationship Graph</span>
          <div className="graph-expand-header-controls">
            <div className="graph-filter-group">
              <label className="graph-filter-label" htmlFor="graph-expand-min-docs">Min References</label>
              <div className="graph-filter-box">
                <input type="number" id="graph-expand-min-docs" className="graph-filter-input" min="2" value={minDocs}
                  onChange={e => onMinDocsChange(Number.parseInt(e.target.value, 10))} />
                <div className="graph-filter-spinners">
                  <button className="graph-filter-spin-btn" tabIndex={-1} aria-label="Increase minimum references" onClick={() => onMinDocsChange(minDocs + 1)}>
                    <svg aria-hidden="true" width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 4l3-3 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  <button className="graph-filter-spin-btn" tabIndex={-1} aria-label="Decrease minimum references" onClick={() => onMinDocsChange(Math.max(2, minDocs - 1))}>
                    <svg aria-hidden="true" width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="layout-picker">
              <button className="layout-picker-btn" onClick={() => setLayoutMenuOpen(o => !o)}>
                <span>{layout}</span>
                <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              {layoutMenuOpen && (
                <div className="layout-picker-menu">
                  {[...GRAPH_LAYOUTS.keys()].map(name => (
                    <button type="button" key={name} className={`btn-plain layout-picker-item${layout === name ? ' active' : ''}`}
                      onClick={() => selectLayout(name)}>
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="layout-info-anchor">
              <button className="btn-icon" aria-label="Layout options" onClick={e => { e.stopPropagation(); setInfoPopupOpen(o => !o); }}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M7 6.5v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <circle cx="7" cy="3.8" r="0.85" fill="currentColor" />
                </svg>
              </button>
              {infoPopupOpen && (
                <div className="layout-info-popup">
                  <div className="layout-info-header">
                    <span className="layout-info-title">Layout Options</span>
                    <button className="layout-info-close" aria-label="Close" onClick={() => setInfoPopupOpen(false)}>&times;</button>
                  </div>
                </div>
              )}
            </div>

            <button className="btn-icon" title="Fit graph" onClick={() => cyRef.current?.fit(undefined, 24)}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M7 1v2M7 11v2M1 7h2M11 7h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
            <button className="btn-icon-danger" title="Close" onClick={onClose}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="graph-expand-body">
          <div ref={containerRef} className="graph-expand-canvas"></div>
          {typesPresent.length > 0 && (
            <div className="graph-legend">
              {typesPresent.map(type => {
                const swatchColor = colors[type as keyof typeof colors] ?? colors.Other;
                return (
                  <button type="button" key={type} className={`btn-plain graph-legend-item${hiddenTypes.has(type) ? ' muted' : ''}`}
                    aria-pressed={!hiddenTypes.has(type)}
                    onClick={() => onToggleHiddenType(type)}>
                    <span className="graph-legend-swatch" style={{ background: swatchColor }}></span>
                    <span className="graph-legend-label">{type}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div ref={tooltipRef} className="graph-tooltip hidden"></div>
    </ModalOverlay>
  );
}
