/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import type { TimerInfoResponse } from "@tomquist/hmjs-protocol";
import TimersTab from "./TimersTab";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

  it("renders timer data and triggers callbacks", async () => {
    const timerInfo: TimerInfoResponse = {
      head: 0x01,
      dataLength: 0,
      cntl: 0,
      command: 0x13,
      rawPayload: new Uint8Array(),
      timerDataOffset: 0,
      trailingData: new Uint8Array(),
      timers: [
        {
          enabled: true,
          start: { hour: 8, minute: 30 },
          end: { hour: 10, minute: 45 },
          outputPower: 120,
        },
      ],
    };

    const onGetTimers = jest.fn();
    const onSetTimers = jest.fn().mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <TimersTab
          timerInfo={timerInfo}
          isConnected={true}
          onGetTimers={onGetTimers}
          onSetTimers={onSetTimers}
        />,
      );
    });

    expect(container.querySelector("h2")?.textContent).toBe("Timer Schedule");
    expect(container.textContent).toContain("08:30 - 10:45 @ 120W");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);

    const getTimersButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Get Timers",
    );
    expect(getTimersButton).not.toBeNull();

    await act(async () => {
      getTimersButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onGetTimers).toHaveBeenCalledTimes(1);

    const addTimerButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Add Timer",
    );
    await act(async () => {
      addTimerButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(container.textContent).toContain("Entries: 2");

    const setTimersButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Set Timers",
    );
    await act(async () => {
      setTimersButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSetTimers).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          enabled: true,
          start: { hour: 8, minute: 30 },
          end: { hour: 10, minute: 45 },
          outputPower: 120,
        }),
      ]),
    );
  });
});
