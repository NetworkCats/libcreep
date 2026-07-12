import type {
  AuxiliaryDetectionName,
  ComponentResult,
  DetectionName,
  FingerprintResult,
} from '../../types.js';

interface ProfileRow {
  readonly durationMs: number;
  readonly name: string;
  readonly percentOfCollection: number;
  readonly status: ComponentResult<unknown>['status'];
}

interface SpeedProfile {
  readonly auxiliary: ReadonlyArray<ProfileRow>;
  readonly collectionDurationMs: number;
  readonly core: ReadonlyArray<ProfileRow>;
  readonly measuredDetectorTimeMs: number;
  readonly parallelismRatio: number;
  readonly rejectedCount: number;
  readonly unsupportedCount: number;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function toRows(
  components:
    | Readonly<Partial<Record<string, ComponentResult<unknown>>>>
    | undefined,
  duration: number,
): ProfileRow[] {
  if (components === undefined) return [];
  return Object.entries(components)
    .flatMap(([name, component]) =>
      component === undefined
        ? []
        : [
            {
              durationMs: round(component.duration),
              name,
              percentOfCollection:
                duration > 0
                  ? round((component.duration / duration) * 100)
                  : 0,
              status: component.status,
            },
          ],
    )
    .sort((left, right) => right.durationMs - left.durationMs);
}

/** @internal */
export function createSpeedProfile(result: FingerprintResult): SpeedProfile {
  const collectionDurationMs = round(result.duration);
  const core = toRows(
    result.components as Readonly<
      Partial<Record<DetectionName, ComponentResult<unknown>>>
    >,
    result.duration,
  );
  const auxiliary = toRows(
    result.auxiliary as Readonly<
      Partial<Record<AuxiliaryDetectionName, ComponentResult<unknown>>>
    >,
    result.duration,
  );
  const all = [...core, ...auxiliary];
  const measuredDetectorTimeMs = round(
    all.reduce((total, row) => total + row.durationMs, 0),
  );

  return {
    auxiliary,
    collectionDurationMs,
    core,
    measuredDetectorTimeMs,
    parallelismRatio:
      collectionDurationMs > 0
        ? round(measuredDetectorTimeMs / collectionDurationMs)
        : 0,
    rejectedCount: all.filter(({ status }) => status === 'rejected').length,
    unsupportedCount: all.filter(({ status }) => status === 'unsupported')
      .length,
  };
}

/** @internal */
export function printSpeedProfile(result: FingerprintResult): void {
  const profile = createSpeedProfile(result);
  console.groupCollapsed(
    `[libcreep speed profile] ${profile.collectionDurationMs}ms total`,
  );
  console.table(profile.core);
  console.table(profile.auxiliary);
  console.table({
    collectionDurationMs: profile.collectionDurationMs,
    measuredDetectorTimeMs: profile.measuredDetectorTimeMs,
    parallelismRatio: profile.parallelismRatio,
    rejectedCount: profile.rejectedCount,
    unsupportedCount: profile.unsupportedCount,
  });
  console.groupEnd();
}
