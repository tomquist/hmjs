/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import type { TimerInfo, TimerInfoResponse } from "@tomquist/hmjs-protocol";
import TimersTab from "./TimersTab";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const timer = (
  enabled: boolean,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
  outputPower: number,
): TimerInfo => ({
  enabled,
  start: { hour: startHour, minute: startMinute },
  end: { hour: endHour, minute: endMinute },
  outputPower,
});

const timerInfo: TimerInfoResponse = {
  head: 0x73,
  dataLength: 0,
  cntl: 0x23,
  command: 0x13,
  rawPayload: new Uint8Array(),
  adaptiveModeEnabled: false,
  smartMeter: null,
  timers: [
    timer(true, 8, 30, 10, 45, 120),
    timer(false, 0, 0, 0, 0, 0),
    timer(false, 0, 0, 23, 59, 80),
  ],
};

describe("TimersTab", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const findButton = (label: string): HTMLButtonElement => {
    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === label,
    );
    if (!button) {
      throw new Error(`Button "${label}" not found`);
    }
    return button;
  };

  const render = async (info: TimerInfoResponse | null, props = {}) => {
    const onGetTimers = jest.fn();
    const onSetTimers = jest.fn().mockResolvedValue(undefined);
    await act(async () => {
      root.render(
        <TimersTab
          timerInfo={info}
          isConnected={true}
          onGetTimers={onGetTimers}
          onSetTimers={onSetTimers}
          {...props}
        />,
      );
    });
    return { onGetTimers, onSetTimers };
  };

  const click = async (element: HTMLElement) => {
    await act(async () => {
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  };

  it("renders one row per device slot, including unused ones", async () => {
    await render(timerInfo);

    expect(container.querySelector("h2")?.textContent).toBe("Timer Schedule");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(container.textContent).toContain("08:30 - 10:45 @ 120W");
    expect(container.textContent).toContain("Slots: 3");
    expect(container.textContent).toContain("Adaptive mode: off");
  });

  it("triggers a read and writes back the complete schedule", async () => {
    const { onGetTimers, onSetTimers } = await render(timerInfo);

    await click(findButton("Get Timers"));
    expect(onGetTimers).toHaveBeenCalledTimes(1);

    const enableSlot2 = container.querySelector<HTMLInputElement>(
      'input[aria-label="Timer 2 enabled"]',
    );
    expect(enableSlot2).not.toBeNull();
    expect(enableSlot2!.checked).toBe(false);
    await click(enableSlot2!);
    expect(enableSlot2!.checked).toBe(true);

    await click(findButton("Set Timers"));

    expect(onSetTimers).toHaveBeenCalledTimes(1);
    const written = onSetTimers.mock.calls[0][0] as TimerInfo[];
    expect(written).toHaveLength(3);
    expect(written[0]).toEqual(timer(true, 8, 30, 10, 45, 120));
    expect(written[1].enabled).toBe(true);
    expect(written[2]).toEqual(timer(false, 0, 0, 23, 59, 80));
  });

  it("requires a schedule to be read before it can be written", async () => {
    const { onSetTimers } = await render(null);

    expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
    expect(findButton("Set Timers").disabled).toBe(true);
    expect(findButton("Export CSV").disabled).toBe(true);
    expect(onSetTimers).not.toHaveBeenCalled();
  });
});
