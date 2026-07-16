/**
 * robots.txt parser/evaluator used by the scanner.
 *
 * This intentionally implements the parts needed for search diagnostics:
 * user-agent groups, Allow/Disallow precedence, `*`, trailing `$`, and Sitemap.
 * Matching follows the robots exclusion protocol's "most specific rule wins"
 * behavior; Allow wins a tie.
 */

export interface RobotsRule {
  directive: 'allow' | 'disallow';
  pattern: string;
}

export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

export interface ParsedRobots {
  groups: RobotsGroup[];
  sitemaps: string[];
  recognizedDirectives: number;
}

function stripComment(line: string): string {
  const hash = line.indexOf('#');
  return (hash >= 0 ? line.slice(0, hash) : line).trim();
}

export function parseRobotsTxt(body: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let recognizedDirectives = 0;
  let current: RobotsGroup | null = null;
  let currentHasRules = false;

  for (const rawLine of body.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = stripComment(rawLine);
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'sitemap') {
      recognizedDirectives++;
      if (value) sitemaps.push(value);
      continue;
    }

    if (field === 'user-agent') {
      recognizedDirectives++;
      if (!value) continue;
      if (!current || currentHasRules) {
        current = { agents: [], rules: [] };
        groups.push(current);
        currentHasRules = false;
      }
      current.agents.push(value.toLowerCase());
      continue;
    }

    if (field !== 'allow' && field !== 'disallow') continue;
    recognizedDirectives++;
    if (!current || current.agents.length === 0) continue;
    current.rules.push({ directive: field, pattern: value });
    currentHasRules = true;
  }

  return {
    groups: groups.filter((group) => group.agents.length > 0),
    sitemaps: [...new Set(sitemaps)],
    recognizedDirectives,
  };
}

function userAgentSpecificity(agentToken: string, crawlerToken: string): number {
  if (agentToken === '*') return 0;
  const agent = agentToken.toLowerCase();
  const crawler = crawlerToken.toLowerCase();
  return crawler.includes(agent) ? agent.length : -1;
}

function ruleRegex(pattern: string): RegExp | null {
  if (!pattern) return null;
  const anchoredEnd = pattern.endsWith('$');
  const source = (anchoredEnd ? pattern.slice(0, -1) : pattern)
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  try {
    return new RegExp(`^${source}${anchoredEnd ? '$' : ''}`);
  } catch {
    return null;
  }
}

function ruleSpecificity(pattern: string): number {
  return pattern.replace(/\*/g, '').replace(/\$$/, '').length;
}

export function isPathAllowed(parsed: ParsedRobots, crawlerToken: string, pathWithQuery: string): boolean {
  let bestAgentSpecificity = -1;
  const matchingGroups: RobotsGroup[] = [];

  for (const group of parsed.groups) {
    const specificity = Math.max(
      ...group.agents.map((agent) => userAgentSpecificity(agent, crawlerToken)),
    );
    if (specificity < 0) continue;
    if (specificity > bestAgentSpecificity) {
      bestAgentSpecificity = specificity;
      matchingGroups.length = 0;
      matchingGroups.push(group);
    } else if (specificity === bestAgentSpecificity) {
      matchingGroups.push(group);
    }
  }

  if (matchingGroups.length === 0) return true;

  let bestRuleSpecificity = -1;
  let allowed = true;
  for (const group of matchingGroups) {
    for (const rule of group.rules) {
      // An empty Disallow means "allow everything".
      if (!rule.pattern) continue;
      const regex = ruleRegex(rule.pattern);
      if (!regex?.test(pathWithQuery)) continue;
      const specificity = ruleSpecificity(rule.pattern);
      if (
        specificity > bestRuleSpecificity ||
        (specificity === bestRuleSpecificity && rule.directive === 'allow')
      ) {
        bestRuleSpecificity = specificity;
        allowed = rule.directive === 'allow';
      }
    }
  }
  return allowed;
}

export function robotsAllows(body: string, crawlerToken: string, url: URL): boolean {
  return isPathAllowed(parseRobotsTxt(body), crawlerToken, `${url.pathname}${url.search}`);
}

