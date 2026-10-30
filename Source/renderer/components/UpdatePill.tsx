import { useUpdate } from '../hooks/useUpdate';

export function UpdatePill() {
  const { state, install } = useUpdate();

  switch (state.status) {
    case 'idle':
      return null;

    case 'available':
      return (
        <button
          className="update-pill"
          onClick={install}
          title={
            state.notes ? `What's new: ${state.notes}` : 'Download and install the new version'
          }
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path
              d="M6.5 1.5v7M3.5 5.5l3 3 3-3M2 11h9"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Update to {state.version}
        </button>
      );

    case 'downloading':
      return (
        <span className="update-pill update-pill--busy" role="status">
          Downloading {state.version}… {state.percent}%
        </span>
      );

    case 'installing':
      return (
        <span className="update-pill update-pill--busy" role="status">
          Installing {state.version}…
        </span>
      );

    case 'error':
      return (
        <button className="update-pill update-pill--error" onClick={install} title={state.message}>
          Update failed — retry
        </button>
      );
  }
}
