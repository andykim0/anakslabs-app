import type { DentalStockCategory } from './dental-stock-types';
import type { ClinicAccentPreset } from '@/lib/types/site';

/** P1 범위: 치과 계열만. 다른 진료과는 택소노미·stock·룰 검증이 끝난 뒤에 연다. */
export const CLINIC_NEWBUILD_SPECIALTIES = [
  'general-dentistry',
  'implant-dentistry',
  'orthodontics',
  'cosmetic-dentistry',
  'pediatric-dentistry',
] as const;

export type ClinicNewbuildSpecialty = typeof CLINIC_NEWBUILD_SPECIALTIES[number];

export const CLINIC_NEWBUILD_SPECIALTY_LABELS = Object.freeze({
  'general-dentistry': 'general dental practice',
  'implant-dentistry': 'dental implant practice',
  orthodontics: 'orthodontic practice',
  'cosmetic-dentistry': 'cosmetic dental practice',
  'pediatric-dentistry': 'pediatric dental practice',
} as const satisfies Record<ClinicNewbuildSpecialty, string>);

/**
 * [D4] 운영자가 고르는 유일한 디자인 축. design-knowledge 팔레트 후보는
 * resolveClinicMasterTheme이 핀에서 팔레트를 재구성해 덮으므로 이 경로에서 무효다.
 */
export const CLINIC_NEWBUILD_ACCENT_PRESETS = [
  'clean-blue',
  'clean-teal',
  'clean-green',
  'clean-warm-neutral',
] as const satisfies readonly ClinicAccentPreset[];

/**
 * premium-dental-v1 신규 발급이 허용하는 표준 치과 서비스 택소노미.
 *
 * 운영자는 이 목록에서만 고를 수 있다. 자유 입력 서비스가 없으므로 모델도, 운영자도
 * 진료 항목을 발명할 수 없고, 각 항목은 라이선스 stock 카테고리에 명시적으로 매핑된다.
 * `neutralDetail`은 사전 검증된 고정 카피로, 카피 생성이 실패하거나 의료광고 게이트에
 * 걸렸을 때의 폴백 본문이다.
 */
export interface ClinicServiceTaxonomyEntry {
  /** 안정 식별자. 합성 sourceUrl(`newbuild://service/<id>`)과 요소 id의 근거가 된다. */
  id: string;
  /** 사이트에 그대로 실리는 서비스명. 컴파일러가 verbatim으로 렌더한다. */
  label: string;
  /** 승인된 dental-stock 4카테고리 중 하나로의 명시 매핑. */
  stockCategory: Exclude<DentalStockCategory, 'bright-interior'>;
  /** 사전 검증된 중립 설명. 생성 카피 실패 시의 결정적 폴백. */
  neutralDetail: string;
}

export const CLINIC_DENTAL_SERVICE_TAXONOMY = Object.freeze([
  {
    id: 'preventive-care',
    label: 'Preventive cleanings and exams',
    stockCategory: 'preventive-general',
    neutralDetail:
      'A hygienist cleans above and below the gumline, and the dentist examines the teeth, gums, and bite. Most adults are seen twice a year, and the interval is set from what the exam finds.',
  },
  {
    id: 'dental-exams-xrays',
    label: 'Digital X-rays and oral exams',
    stockCategory: 'preventive-general',
    neutralDetail:
      'Digital images show decay, bone level, and roots that a visual exam cannot reach. The dentist reviews the images with you and explains what is being tracked between visits.',
  },
  {
    id: 'gum-therapy',
    label: 'Gum disease therapy',
    stockCategory: 'preventive-general',
    neutralDetail:
      'Deep cleaning removes hardened deposits from the root surfaces below the gumline. Therapy is usually staged over more than one visit, and recovery depends on how far the condition has advanced.',
  },
  {
    id: 'root-canal',
    label: 'Root canal therapy',
    stockCategory: 'preventive-general',
    neutralDetail:
      'Root canal therapy removes inflamed or infected pulp from inside the tooth and seals the canal. A crown is often placed afterwards, and recovery time depends on the tooth involved.',
  },
  {
    id: 'extractions',
    label: 'Tooth extractions',
    stockCategory: 'preventive-general',
    neutralDetail:
      'A tooth is removed when decay, fracture, or crowding leaves no restorable structure. The dentist reviews the replacement options and aftercare before the procedure is scheduled.',
  },
  {
    id: 'wisdom-teeth',
    label: 'Wisdom tooth removal',
    stockCategory: 'preventive-general',
    neutralDetail:
      'Third molars are evaluated with imaging to see how the roots sit against the nerve and sinus. Removal is planned around that anatomy, and swelling for a few days after the procedure is common.',
  },
  {
    id: 'emergency-care',
    label: 'Emergency dental care',
    stockCategory: 'preventive-general',
    neutralDetail:
      'Same-day slots are held for pain, swelling, a lost restoration, or a fractured tooth. Call the practice and describe the symptom so the front desk can advise on the next step.',
  },
  {
    id: 'pediatric-dentistry',
    label: 'Pediatric dentistry',
    stockCategory: 'preventive-general',
    neutralDetail:
      'Children are seen for exams, cleanings, sealants, and fluoride, with visit length kept short. The dentist reviews brushing, diet, and eruption timing with the parent at each visit.',
  },
  {
    id: 'dental-implants',
    label: 'Dental implants',
    stockCategory: 'implant',
    neutralDetail:
      'A titanium post replaces the root of a missing tooth, and a crown is attached once the site has healed. Treatment usually spans several visits across a few months.',
  },
  {
    id: 'full-arch-implants',
    label: 'Full-arch implant restoration',
    stockCategory: 'implant',
    neutralDetail:
      'A fixed bridge is carried on several implants when an entire arch is missing or failing. Planning covers bone volume, bite, and the maintenance the restoration will need over time.',
  },
  {
    id: 'bone-grafting',
    label: 'Bone grafting for implants',
    stockCategory: 'implant',
    neutralDetail:
      'Grafting rebuilds ridge width or height where bone has resorbed, so an implant has support. Healing is measured in months before the implant procedure itself is scheduled.',
  },
  {
    id: 'clear-aligners',
    label: 'Clear aligners',
    stockCategory: 'orthodontic',
    neutralDetail:
      'A sequence of removable trays moves the teeth in small steps. Wear time is prescribed in hours per day, and the treatment length depends on the movement each case requires.',
  },
  {
    id: 'braces',
    label: 'Braces',
    stockCategory: 'orthodontic',
    neutralDetail:
      'Fixed brackets and wires are adjusted at regular intervals to correct crowding, spacing, or bite. The dentist reviews cleaning technique and diet limits at the start of treatment.',
  },
  {
    id: 'retainers',
    label: 'Orthodontic retainers',
    stockCategory: 'orthodontic',
    neutralDetail:
      'A retainer holds the corrected position after braces or aligners. Wear is prescribed on a schedule, and teeth can shift again when the retainer is not worn as instructed.',
  },
  {
    id: 'teeth-whitening',
    label: 'Teeth whitening',
    stockCategory: 'cosmetic-restorative',
    neutralDetail:
      'Whitening is offered as an in-office session or as custom trays for home use. Existing crowns and fillings do not change shade, so the dentist reviews the plan beforehand.',
  },
  {
    id: 'veneers',
    label: 'Porcelain veneers',
    stockCategory: 'cosmetic-restorative',
    neutralDetail:
      'Thin porcelain facings are bonded to the front of prepared teeth to change shape, shade, or alignment. Enamel is reduced to make room, so the change is not reversible.',
  },
  {
    id: 'crowns-bridges',
    label: 'Crowns and bridges',
    stockCategory: 'cosmetic-restorative',
    neutralDetail:
      'A crown covers a tooth that has lost too much structure to hold a filling, and a bridge spans a gap using the neighbouring teeth. Both are made from an impression or a digital scan.',
  },
  {
    id: 'fillings',
    label: 'Tooth-coloured fillings',
    stockCategory: 'cosmetic-restorative',
    neutralDetail:
      'Composite is bonded into the cavity after the decay is removed and shaped to the bite. The dentist checks the contact and the margin before you leave the chair.',
  },
  {
    id: 'dentures',
    label: 'Dentures and partials',
    stockCategory: 'cosmetic-restorative',
    neutralDetail:
      'A removable prosthesis replaces several teeth or a full arch. Fit is refined over a series of appointments, and relines are needed as the ridge changes shape.',
  },
  {
    id: 'night-guards',
    label: 'Night guards for grinding',
    stockCategory: 'cosmetic-restorative',
    neutralDetail:
      'A custom guard separates the teeth during sleep to limit wear from grinding and clenching. The dentist checks the fit and the bite marks it leaves at follow-up visits.',
  },
] as const satisfies readonly ClinicServiceTaxonomyEntry[]);

export type ClinicDentalServiceId =
  typeof CLINIC_DENTAL_SERVICE_TAXONOMY[number]['id'];

export const CLINIC_DENTAL_SERVICE_IDS = Object.freeze(
  CLINIC_DENTAL_SERVICE_TAXONOMY.map((entry) => entry.id),
) as readonly ClinicDentalServiceId[];

export const CLINIC_NEWBUILD_MIN_SERVICES = 2;
export const CLINIC_NEWBUILD_MAX_SERVICES = 8;

export function clinicServiceTaxonomyEntry(
  id: string,
): ClinicServiceTaxonomyEntry | undefined {
  return CLINIC_DENTAL_SERVICE_TAXONOMY.find((entry) => entry.id === id);
}

/**
 * 히어로 stock 카테고리. 선택 서비스의 명시 매핑만 세고, 동률은 택소노미 선언 순서로
 * 깬다 — 같은 선택은 항상 같은 카테고리를 낸다.
 */
export function resolveClinicNewbuildStockCategory(
  entries: readonly ClinicServiceTaxonomyEntry[],
): ClinicServiceTaxonomyEntry['stockCategory'] {
  const counts = new Map<ClinicServiceTaxonomyEntry['stockCategory'], number>();
  for (const entry of entries) {
    counts.set(entry.stockCategory, (counts.get(entry.stockCategory) ?? 0) + 1);
  }
  const declarationOrder = [...new Set(
    CLINIC_DENTAL_SERVICE_TAXONOMY.map((entry) => entry.stockCategory),
  )];
  let best = declarationOrder[0];
  let bestCount = -1;
  for (const category of declarationOrder) {
    const count = counts.get(category) ?? 0;
    if (count > bestCount) {
      best = category;
      bestCount = count;
    }
  }
  return best;
}
