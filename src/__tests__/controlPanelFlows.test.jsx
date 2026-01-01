import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import ControlPanel from '../components/ControlPanel.jsx';

function seedLocalStorageForTwoBoxes() {
  const listboxes = [
    {
      categorie: 'U16-Baieti',
      routesCount: 2,
      holdsCounts: [10, 12],
      routeIndex: 1,
      holdsCount: 10,
      initiated: true,
      timerPreset: '05:00',
      concurenti: [
        { nume: 'Ion', club: 'Alpin', marked: false },
        { nume: 'Mihai', club: 'Climb', marked: false },
      ],
    },
    {
      categorie: 'U16-Fete',
      routesCount: 2,
      holdsCounts: [8, 9],
      routeIndex: 1,
      holdsCount: 8,
      initiated: true,
      timerPreset: '05:00',
      concurenti: [
        { nume: 'Ana', club: 'Alpin', marked: false },
        { nume: 'Maria', club: 'Climb', marked: false },
      ],
    },
  ];

  // time criterion enabled
  global.localStorage.getItem.mockImplementation((key) => {
    if (key === 'listboxes') return JSON.stringify(listboxes);
    if (key === 'climbingTime') return '05:00';
    if (key === 'timeCriterionEnabled') return 'on';
    // timer values used by readCurrentTimerSec
    if (key === 'timer-0') return '250'; // 4:10 remaining
    if (key === 'timer-1') return '295'; // 4:55 remaining
    return null;
  });
}

describe('ControlPanel button flows', () => {
  beforeEach(() => {
    // reset mocks
    global.localStorage.getItem.mockReset();
    global.localStorage.setItem.mockReset();
    global.localStorage.removeItem.mockReset();
    seedLocalStorageForTwoBoxes();

    // mock fetch
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
  });

  it('sends PROGRESS_UPDATE when clicking +1 Hold for each listbox', async () => {
    render(<ControlPanel />);

    // Start both boxes to enable +1 Hold
    const startButtons = await screen.findAllByText('Start Time');
    expect(startButtons.length).toBeGreaterThanOrEqual(2);
    // click for first two boxes
    startButtons[0].click();
    startButtons[1].click();

    const plusHoldButtons = await screen.findAllByText('+1 Hold');
    expect(plusHoldButtons.length).toBeGreaterThanOrEqual(2);

    plusHoldButtons[0].click();
    plusHoldButtons[1].click();

    // Verify fetch called with PROGRESS_UPDATE for both boxes
    const calls = global.fetch.mock.calls.map((c) => ({ url: c[0], body: c[1]?.body }));
    const progressCalls = calls.filter(
      (c) => typeof c.body === 'string' && c.body.includes('PROGRESS_UPDATE'),
    );
    // At least two progress updates (one per box)
    expect(progressCalls.length).toBeGreaterThanOrEqual(2);
    // Ensure boxIds 0 and 1 present
    const hasBox0 = progressCalls.some((c) => c.body.includes('"boxId":0'));
    const hasBox1 = progressCalls.some((c) => c.body.includes('"boxId":1'));
    expect(hasBox0).toBe(true);
    expect(hasBox1).toBe(true);
  });

  it('registers time after Stop and shows Registered text', async () => {
    render(<ControlPanel />);

    // Start then Stop for box 0 to enter paused state
    const startButtons = await screen.findAllByText('Start Time');
    startButtons[0].click();

    const stopButtons = await screen.findAllByText('Stop Time');
    stopButtons[0].click();

    // Register Time should be visible now
    const registerButtons = await screen.findAllByText('Register Time');
    registerButtons[0].click();

    // UI should display Registered: mm:ss for box 0 (elapsed 50s from 300-250)
    const registeredText = await screen.findByText(/Registered: 00:50/);
    expect(registeredText).toBeInTheDocument();

    // Verify REGISTER_TIME sent to backend
    const calls = global.fetch.mock.calls.map((c) => ({ url: c[0], body: c[1]?.body }));
    const registerCalls = calls.filter(
      (c) => typeof c.body === 'string' && c.body.includes('REGISTER_TIME'),
    );
    const hasBox0 = registerCalls.some((c) => c.body.includes('"boxId":0'));
    expect(hasBox0).toBe(true);
  });
});
