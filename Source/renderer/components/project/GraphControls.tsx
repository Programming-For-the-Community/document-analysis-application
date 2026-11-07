import { RefObject, useState } from 'react';

import { GRAPH_LAYOUTS } from '../../../constants/renderer/project/graph';
import { Theme } from '../../../types/renderer/shared';
import { CyInstance, getEntityColors, getLayoutConfig } from '../../../utils/renderer/graph';

// Controls shared by the graph panel and its expanded (full-screen) modal.

export function MinReferencesFilter({ id, value, onChange }: Readonly<{
  id: string;
  value: number;
  onChange: (value: number) => void;
}>) {
  return (
    <div className="graph-filter-group">
      <label className="graph-filter-label" htmlFor={id}>Min References</label>
      <div className="graph-filter-box">
        <input type="number" id={id} className="graph-filter-input" min="2" value={value}
          onChange={e => onChange(Number.parseInt(e.target.value, 10))} />
        <div className="graph-filter-spinners">
          <button className="graph-filter-spin-btn" tabIndex={-1} aria-label="Increase minimum references" onClick={() => onChange(value + 1)}>
            <svg aria-hidden="true" width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 4l3-3 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button className="graph-filter-spin-btn" tabIndex={-1} aria-label="Decrease minimum references" onClick={() => onChange(Math.max(2, value - 1))}>
            <svg aria-hidden="true" width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// Layout picker, layout info popup and fit-to-view — returned as siblings so they
// sit directly in the caller's flex row
export function LayoutControls({ layout, cyRef, onLayoutChange }: Readonly<{
  layout: string;
  cyRef: RefObject<CyInstance | null>;
  onLayoutChange: (layout: string) => void;
}>) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  function selectLayout(name: string) {
    setMenuOpen(false);
    onLayoutChange(name);
    cyRef.current?.layout(getLayoutConfig(name)).run();
  }

  return (
    <>
      <div className="layout-picker">
        <button className="layout-picker-btn" onClick={() => setMenuOpen(o => !o)}>
          <span>{layout}</span>
          <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        {menuOpen && (
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
        <button className="btn-icon" aria-label="Layout options" onClick={e => { e.stopPropagation(); setInfoOpen(o => !o); }}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3" />
            <path d="M7 6.5v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="7" cy="3.8" r="0.85" fill="currentColor" />
          </svg>
        </button>
        {infoOpen && (
          <div className="layout-info-popup">
            <div className="layout-info-header">
              <span className="layout-info-title">Layout Options</span>
              <button className="layout-info-close" aria-label="Close" onClick={() => setInfoOpen(false)}>&times;</button>
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
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M7 1v2M7 11v2M1 7h2M11 7h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
    </>
  );
}

// Entity-type legend; each entry toggles that type's nodes
export function GraphLegend({ nodes, hiddenTypes, theme, onToggleHiddenType }: Readonly<{
  nodes: { data: { type: string } }[];
  hiddenTypes: Set<string>;
  theme: Theme;
  onToggleHiddenType: (type: string) => void;
}>) {
  const types = [...new Set(nodes.map(n => n.data.type))].sort((a, b) => a.localeCompare(b));
  if (types.length === 0) return null;
  const colors = getEntityColors(theme);

  return (
    <div className="graph-legend">
      {types.map(type => (
        <button type="button" key={type} className={`btn-plain graph-legend-item${hiddenTypes.has(type) ? ' muted' : ''}`}
          aria-pressed={!hiddenTypes.has(type)}
          title={`Click to show/hide ${type} nodes`} onClick={() => onToggleHiddenType(type)}>
          <span className="graph-legend-swatch" style={{ background: colors[type as keyof typeof colors] ?? colors.Other }}></span>
          <span className="graph-legend-label">{type}</span>
        </button>
      ))}
    </div>
  );
}
