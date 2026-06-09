import { useRef, useEffect, useState } from 'react';
import { Theme } from '../../../types/renderer';
import {
  CyInstance, createCytoscape, wireGraphHover,
  applyTypeFilters, createCenteringResizeObserver,
  getEntityColors, getLayoutConfig, getGraphStyle,
} from '../../../utils/renderer/graph';

const LAYOUTS = [
  { value: 'cose',      label: 'Classic' },
  { value: 'fcose',     label: 'Force' },
  { value: 'radial',    label: 'Radial' },
  { value: 'tree',      label: 'Tree' },
  { value: 'dagre',     label: 'Hierarchical' },
  { value: 'concentric',label: 'Concentric' },
  { value: 'circle',    label: 'Circle' },
  { value: 'grid',      label: 'Grid' },
];

interface GraphExpandModalProps {
  isOpen: boolean;
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout: string;
  minDocs: number;
  hiddenTypes: Set<string>;
  theme: Theme;
  onClose: () => void;
  onLayoutChange: (layout: string) => void;
  onMinDocsChange: (value: number) => void;
  onToggleHiddenType: (type: string) => void;
  onNodeClick: (entityName: string, entityType: string) => void;
}

export function GraphExpandModal({
  isOpen, nodes, edges, layout, minDocs, hiddenTypes, theme,
  onClose, onLayoutChange, onMinDocsChange, onToggleHiddenType, onNodeClick,
}: GraphExpandModalProps) {
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

  const typesPresent = [...new Set(nodes.map(n => n.data.type))].sort();
  const colors = getEntityColors(theme);

  return (
    <div className="graph-expand-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="graph-expand-modal">
        <div className="graph-expand-header">
          <span className="graph-expand-title">Relationship Graph</span>
          <div className="graph-expand-header-controls">
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

            <div className="layout-picker">
              <button className="layout-picker-btn" onClick={() => setLayoutMenuOpen(o => !o)}>
                <span>{LAYOUTS.find(l => l.value === layout)?.label ?? 'Classic'}</span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              {layoutMenuOpen && (
                <div className="layout-picker-menu" onClick={() => setLayoutMenuOpen(false)}>
                  {LAYOUTS.map(l => (
                    <div key={l.value} className={`layout-picker-item${layout === l.value ? ' active' : ''}`}
                      onClick={() => { onLayoutChange(l.value); cyRef.current?.layout(getLayoutConfig(l.value)).run(); }}>
                      {l.label}
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
                </div>
              )}
            </div>

            <button className="btn-icon" title="Fit graph" onClick={() => cyRef.current?.fit(24)}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M7 1v2M7 11v2M1 7h2M11 7h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
            <button className="btn-icon-danger" title="Close" onClick={onClose}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="graph-expand-body">
          <div ref={containerRef} className="graph-expand-canvas"></div>
          {typesPresent.length > 0 && (
            <div className="graph-legend">
              {typesPresent.map(type => (
                <div key={type} className={`graph-legend-item${hiddenTypes.has(type) ? ' muted' : ''}`}
                  onClick={() => onToggleHiddenType(type)}>
                  <span className="graph-legend-swatch" style={{ background: colors[type] ?? colors['Other'] }}></span>
                  <span className="graph-legend-label">{type}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div ref={tooltipRef} className="graph-tooltip hidden"></div>
    </div>
  );
}