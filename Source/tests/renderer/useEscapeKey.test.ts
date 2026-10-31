// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useEscapeKey } from '../../renderer/hooks/useEscapeKey';

const press = (key: string) => document.dispatchEvent(new window.KeyboardEvent('keydown', { key }));

describe('useEscapeKey', () => {
  it('calls the latest callback on Escape until unmounted', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = renderHook(({ cb }) => useEscapeKey(cb), {
      initialProps: { cb: first },
    });

    press('Enter');
    expect(first).not.toHaveBeenCalled();

    rerender({ cb: second });
    press('Escape');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    unmount();
    press('Escape');
    expect(second).toHaveBeenCalledTimes(1);
  });
});
