import { defenseDebugLog } from "../../utils/debug";
import type {
  StatusLifecycleEvent,
  StatusLifecycleSink,
} from "./types";

const devSink: StatusLifecycleSink = {
  publish: (event: StatusLifecycleEvent) => {
    if (import.meta.env?.DEV) {
      defenseDebugLog("statusLifecycle", event);
    }
  },
};

const sinks = new Set<StatusLifecycleSink>([devSink]);

export const setStatusLifecycleSink = (
  sink: StatusLifecycleSink | null | undefined
) => {
  sinks.clear();
  sinks.add(devSink);
  if (sink) {
    sinks.add(sink);
  }
};

export const registerStatusLifecycleSink = (
  sink: StatusLifecycleSink | null | undefined
) => {
  if (!sink) {
    return () => {};
  }
  sinks.add(sink);
  return () => {
    sinks.delete(sink);
  };
};

export const getStatusLifecycleSinks = () => Array.from(sinks);

export const publishStatusLifecycleEvent = (
  event: StatusLifecycleEvent
) => {
  sinks.forEach((sink) => {
    try {
      sink.publish(event);
    } catch (error) {
      if (import.meta.env?.DEV) {
        defenseDebugLog("statusLifecycle:error", error);
      }
    }
  });
};
