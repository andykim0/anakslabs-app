export interface ClinicTextAuditSource {
  sourceUrl: string;
  included: readonly string[];
  includedEvidence: readonly {
    selector: string;
    text: string;
  }[];
}

export interface ClinicCompiledTextPage<TPage> {
  sourceUrl: string;
  slug: string | null;
  page: TPage | undefined;
}

export interface ClinicPerPageCompleteness {
  sourceUrl: string;
  slug: string | null;
  originalBlocks: number;
  missing: string[];
  missingDetails: {
    selector: string;
    text: string;
  }[];
}

/**
 * Per-page completeness is the primary axis. A site-global comparison can only be reported as
 * auxiliary evidence because it can hide a string moved to the wrong page.
 */
export function auditClinicTextCompleteness<TPage>(input: {
  sources: readonly ClinicTextAuditSource[];
  compiledPages: readonly ClinicCompiledTextPage<TPage>[];
  compiledText: (page: TPage) => string;
  normalize: (value: string) => string;
  globalRenderedText?: string;
}): {
  perPage: ClinicPerPageCompleteness[];
  failures: ClinicPerPageCompleteness[];
  globalMissing: string[];
} {
  const compiledByUrl = new Map(input.compiledPages.map((entry) => [
    entry.sourceUrl,
    entry,
  ]));
  const perPage = input.sources.map((source) => {
    const compiled = compiledByUrl.get(source.sourceUrl);
    const rendered = compiled?.page ? input.compiledText(compiled.page) : '';
    const missing = source.included.filter((text) => (
      !rendered.includes(input.normalize(text))
    ));
    return {
      sourceUrl: source.sourceUrl,
      slug: compiled?.slug ?? null,
      originalBlocks: source.included.length,
      missing,
      missingDetails: source.includedEvidence.filter((entry) => (
        missing.includes(entry.text)
      )),
    };
  });
  const globalCompiledText = input.normalize(input.globalRenderedText
    ?? input.compiledPages
      .flatMap((entry) => (entry.page ? [input.compiledText(entry.page)] : []))
      .join('\n'));
  const globalMissing = input.sources
    .flatMap((source) => source.included)
    .filter((text) => !globalCompiledText.includes(input.normalize(text)));
  return {
    perPage,
    failures: perPage.filter((entry) => entry.missing.length > 0),
    globalMissing,
  };
}

export function enumerateClinicReverseText(input: {
  original: readonly string[];
  rendered: readonly string[];
  normalize: (value: string) => string;
}): string[] {
  const original = new Set(input.original.map(input.normalize));
  return [...new Set(input.rendered.map(input.normalize))]
    .filter((text) => text.length > 0 && !original.has(text));
}

export function auditClinicRenderBlockIntegrity<TSource extends {
  sourceUrl: string;
  sourceNodeId: string;
  sourceText: string;
}>(input: {
  expected: readonly TSource[];
  assignments: readonly {
    sourceNodeId: string;
    renderedBlockId: string;
  }[];
}): (TSource & { renderedBlockIds: string[] })[] {
  const renderedBlocksByNode = new Map<string, Set<string>>();
  for (const assignment of input.assignments) {
    const blocks = renderedBlocksByNode.get(assignment.sourceNodeId) ?? new Set<string>();
    blocks.add(assignment.renderedBlockId);
    renderedBlocksByNode.set(assignment.sourceNodeId, blocks);
  }
  return input.expected.flatMap((source) => {
    const renderedBlockIds = [...(renderedBlocksByNode.get(source.sourceNodeId) ?? [])];
    return renderedBlockIds.length === 1
      ? []
      : [{ ...source, renderedBlockIds }];
  });
}
