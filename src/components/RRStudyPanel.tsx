import type { AppState, Command } from "../types";
import type { RRPlan } from "../core/rr-study";
import { DEFAULT_HTF } from "../core/htf";
import { LearningHub } from "./LearningHub";

// Compatibility entry for the old App route. Both routes now render the same path.
// Existing study data/IPC remain supported; history is read-only in LearningHub.
export function RRStudyPanel({
  state,
  call,
}: {
  state: AppState;
  call: (command: Command) => Promise<any>;
  picking: boolean;
  pick: (value: boolean) => void;
  focusRange: () => void;
  onDraft: (value: { rangeId: string; value: RRPlan } | null) => void;
}) {
  return (
    <LearningHub
      state={state}
      call={call}
      showChart={(timeframe) => {
        if (state.session)
          void call({
            type: "ui",
            value: {
              layout: {
                ...state.session.layout,
                timeframe,
                htf: {
                  ...DEFAULT_HTF,
                  ...state.session.layout.htf,
                  enabled: true,
                  count: 1,
                  timeframe: "4H",
                },
              },
            },
          });
      }}
    />
  );
}
