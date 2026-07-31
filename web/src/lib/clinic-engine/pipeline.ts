import {
  CLINIC_ENGINE_GATE_IDS,
  CLINIC_ENGINE_PHASES,
  type ClinicEngineGateEvidence,
  type ClinicEngineGateResult,
  type ClinicEngineProfile,
  type ClinicEngineTrace,
} from './contracts';

const traceByOutput = new WeakMap<object, ClinicEngineTrace>();

function evaluateClinicEngineGates(
  evidence: ClinicEngineGateEvidence,
): ClinicEngineGateResult[] {
  return CLINIC_ENGINE_GATE_IDS.map((id) => ({
    id,
    status: evidence[id] === undefined
      ? 'deferred'
      : evidence[id]
        ? 'pass'
        : 'fail',
  }));
}

function rememberTrace(output: unknown, trace: ClinicEngineTrace): void {
  if ((typeof output === 'object' && output !== null) || typeof output === 'function') {
    traceByOutput.set(output as object, trace);
  }
}

/**
 * One deterministic clinic pipeline. Profile adapters own policy and source-specific parsing;
 * this function owns the phase order and the complete gate registry.
 */
export function runClinicEngine<TInput, TSource, TPagePlan, TOutput>(input: {
  profile: ClinicEngineProfile;
  value: TInput;
  extractSource: (value: TInput) => TSource;
  splitPages: (source: TSource) => TPagePlan;
  resolveLayouts: (plan: TPagePlan) => TOutput;
  gateEvidence?: (output: TOutput) => ClinicEngineGateEvidence;
}): TOutput {
  const source = input.extractSource(input.value);
  const plan = input.splitPages(source);
  const output = input.resolveLayouts(plan);
  const gates = evaluateClinicEngineGates(input.gateEvidence?.(output) ?? {});
  rememberTrace(output, {
    profileId: input.profile.id,
    phases: CLINIC_ENGINE_PHASES,
    gates,
  });
  return output;
}

export function runClinicSourceExtraction<TInput, TOutput>(input: {
  profile: ClinicEngineProfile;
  value: TInput;
  extract: (value: TInput) => TOutput;
}): TOutput {
  return runClinicEngine({
    profile: input.profile,
    value: input.value,
    extractSource: input.extract,
    splitPages: (source) => source,
    resolveLayouts: (source) => source,
  });
}

export function runClinicAudit<TInput, TOutput>(input: {
  profile: ClinicEngineProfile;
  value: TInput;
  audit: (value: TInput) => TOutput;
  evidence?: (output: TOutput) => ClinicEngineGateEvidence;
}): TOutput {
  return runClinicEngine({
    profile: input.profile,
    value: input.value,
    extractSource: (value) => value,
    splitPages: (value) => value,
    resolveLayouts: input.audit,
    gateEvidence: input.evidence,
  });
}

export function clinicEngineTraceFor(output: object): ClinicEngineTrace | undefined {
  return traceByOutput.get(output);
}
