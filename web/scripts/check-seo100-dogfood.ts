/**
 * npm test의 E3 회귀가 react-server 조건에서 실제 정적 발행 렌더+preflight를 실행한다.
 * 외부 네트워크나 브라우저 없이 11개 대표 시드의 점수만 JSON으로 반환한다.
 */
import { preflightScan } from '@/lib/scan/preflight';
import { scanRuleFor } from '@/lib/scan/rule-registry';
import {
  SEO100_DOGFOOD_SEEDS,
  seo100ConfigFor,
  seo100SurveyFor,
} from './lib/seo100-dogfood-fixtures';

const matrix = SEO100_DOGFOOD_SEEDS.map((seed) => {
  const result = preflightScan(seo100ConfigFor(seed), {
    tier: 'basic',
    siteUrl: `https://${seed.id}.example.com`,
  });
  return {
    seed: seed.id,
    templateId: seo100SurveyFor(seed).templateId,
    dark: Boolean(seed.dark),
    scores: result.scores,
    issues: result.issues.map((issue) => issue.code),
    systemIssues: result.issues
      .filter((issue) => scanRuleFor(issue.code)?.ownership === 'system')
      .map((issue) => issue.code),
  };
});

process.stdout.write(JSON.stringify(matrix));
