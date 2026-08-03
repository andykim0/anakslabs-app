import type {
  BusinessFactAnswer,
  BusinessFactKey,
  GuidedFaqAnswer,
  LivePurposeId,
  SurveyInput,
} from '@/lib/types/domain';

export type ContentIndustryGroup =
  | 'cafe'
  | 'food'
  | 'medical'
  | 'beauty'
  | 'workshop'
  | 'education'
  | 'legal'
  | 'retail'
  | 'generic';

export interface BusinessFactQuestion {
  key: BusinessFactKey;
  label: string;
  hint: string;
  placeholder: string;
  required?: boolean;
}

export interface GuidedFaqQuestion {
  id: string;
  question: string;
  hint: string;
}

export interface HonestBrandingCopy {
  kicker: string;
  title: string;
  heroSub: string;
  paragraphs: readonly string[];
  principles: readonly { title: string; description: string }[];
}

export interface ContentDepthHomeModel {
  branding: HonestBrandingCopy;
  customerIntroduction: readonly string[];
  strengths: readonly { title: string; description: string }[];
  contentItems: readonly {
    name: string;
    price?: string;
    description?: string;
  }[];
  galleryImages: readonly string[];
  faq: readonly { question: string; answer: string }[];
  directions: readonly { label: string; value: string }[];
  contact: readonly { label: string; value: string }[];
}

export interface MainStorytellingModel {
  kicker: string;
  title: string;
  paragraphs: readonly string[];
  hasCustomerStory: boolean;
  valuesLead: string;
  values: readonly { title: string; description: string }[];
}

const REQUIRED_FACT_KEYS_BY_PURPOSE = {
  local_store: ['phone', 'openingHours'],
  booking_service: ['phone', 'openingHours'],
  edu_membership: ['phone'],
  company_brand: ['phone'],
  portfolio: [],
  one_page: [],
} as const satisfies Record<LivePurposeId, readonly BusinessFactKey[]>;

/** 목적과 실제 전환 구조에 필요한 최소 사실만 필수로 둔다. */
export function requiredFactKeysFor(purpose: LivePurposeId): readonly BusinessFactKey[] {
  return REQUIRED_FACT_KEYS_BY_PURPOSE[purpose];
}

const FACT_LABELS: Readonly<Partial<Record<BusinessFactKey, string>>> = {
  phone: 'Phone',
  openingHours: 'Hours',
  address: 'Address',
  parking: 'Parking',
  reservation: 'Appointments',
  paymentMethods: 'Payment',
  accessibility: 'Accessibility',
  pets: 'Pets',
  wifi: 'Wi-Fi',
  directions: 'Directions',
  caseStudies: 'Selected work',
};

const COMMON_FACT_QUESTIONS: readonly BusinessFactQuestion[] = [
  { key: 'phone', label: 'Phone', hint: 'The public number or contact channel patients should use', placeholder: 'Example: (213) 555-0148' },
  { key: 'openingHours', label: 'Hours', hint: 'Hours by day, including days the office is closed', placeholder: 'Example: Mon–Fri, 8:00 AM–5:00 PM' },
  { key: 'address', label: 'Full address', hint: 'Include the suite or floor so patients can find you', placeholder: 'Example: 1200 Wilshire Blvd, Suite 400, Los Angeles, CA' },
  { key: 'parking', label: 'Parking', hint: 'State what is available and any limits', placeholder: 'Example: Validated garage parking for 90 minutes' },
  { key: 'reservation', label: 'How to book', hint: 'The real phone, form, or booking link patients use', placeholder: 'Example: Call the office or use our booking form' },
  { key: 'paymentMethods', label: 'Payment', hint: 'List only the payment methods you accept', placeholder: 'Example: Major credit cards and CareCredit' },
  { key: 'accessibility', label: 'Accessibility', hint: 'Floor, elevator, and wheelchair access', placeholder: 'Example: Step-free entrance and elevator access' },
  { key: 'pets', label: 'Pets', hint: 'Whether pets are allowed and under what conditions', placeholder: 'Example: Service animals only' },
  { key: 'wifi', label: 'Wi-Fi', hint: 'Whether guest Wi-Fi is available', placeholder: 'Example: Guest Wi-Fi is available' },
  { key: 'directions', label: 'Directions', hint: 'How to reach the office from a nearby road or landmark', placeholder: 'Example: Two blocks east of the Metro station' },
];

const INDUSTRY_FACT_QUESTIONS: Record<ContentIndustryGroup, readonly BusinessFactQuestion[]> = {
  cafe: [
    { key: 'signature', label: 'Signature item', hint: 'A real item to feature first', placeholder: 'Example: House cold brew' },
    { key: 'seating', label: 'Seating', hint: 'Actual seat count and seating types', placeholder: 'Example: 6 counter seats and 5 tables' },
    { key: 'outlets', label: 'Power outlets', hint: 'Where outlet seating is available', placeholder: 'Example: Four window seats have outlets' },
    { key: 'groupSeating', label: 'Group seating', hint: 'Group size and reservation requirements', placeholder: 'Example: One table for up to 6; reservations recommended' },
  ],
  food: [
    { key: 'signature', label: 'Featured dish', hint: 'A real dish to feature first', placeholder: 'Example: Wood-fired branzino' },
    { key: 'groupSeating', label: 'Groups', hint: 'Group size and reservation requirements', placeholder: 'Example: One table for up to 8' },
    { key: 'services', label: 'Takeout and delivery', hint: 'Only the options you currently provide', placeholder: 'Example: Takeout available; no delivery' },
  ],
  medical: [
    { key: 'specialties', label: 'Services', hint: 'Treatments the practice currently provides', placeholder: 'Example: General, cosmetic, and implant dentistry' },
    { key: 'credentials', label: 'Provider credentials', hint: 'Only credentials and experience the provider has verified', placeholder: 'Example: DDS, license details, and professional memberships' },
    { key: 'insurance', label: 'Insurance and payment', hint: 'Accepted plans or how patients should verify coverage', placeholder: 'Example: Call the office to verify your plan' },
  ],
  beauty: [
    { key: 'services', label: 'Services', hint: 'Services you currently provide', placeholder: 'Example: Cuts, color, and styling' },
    { key: 'duration', label: 'Typical duration', hint: 'The real time range for each service', placeholder: 'Example: Cut, 40 minutes; color, about 2 hours' },
    { key: 'specialties', label: 'Specialties', hint: 'Styles or services you focus on', placeholder: 'Example: Short cuts and dimensional color' },
  ],
  workshop: [
    { key: 'classes', label: 'Classes', hint: 'Classes currently offered', placeholder: 'Example: Intro pottery and six-week studio course' },
    { key: 'duration', label: 'Class length', hint: 'The real duration of each class', placeholder: 'Example: Intro class, about 2 hours' },
    { key: 'materials', label: 'Materials', hint: 'What is included and what guests should bring', placeholder: 'Example: Materials and apron included' },
  ],
  education: [
    { key: 'classes', label: 'Courses', hint: 'Programs currently enrolling or running', placeholder: 'Example: Algebra II small-group course' },
    { key: 'duration', label: 'Schedule', hint: 'Session frequency and duration', placeholder: 'Example: Twice a week, 90 minutes per session' },
    { key: 'specialties', label: 'Subjects', hint: 'What you currently teach', placeholder: 'Example: Middle-school math and SAT preparation' },
  ],
  legal: [
    { key: 'services', label: 'Practice areas', hint: 'The matters you actually handle', placeholder: 'Example: Estate planning and real estate' },
    { key: 'credentials', label: 'Credentials', hint: 'Only verified licenses and experience', placeholder: 'Example: State bar admission and years in practice' },
    { key: 'caseStudies', label: 'Selected work', hint: 'Only work that can be discussed publicly', placeholder: 'Example: Client-approved matter types and scope' },
    { key: 'duration', label: 'Consultation length', hint: 'The actual appointment unit', placeholder: 'Example: Initial consultation, 50 minutes' },
  ],
  retail: [
    { key: 'signature', label: 'Featured product', hint: 'A real product to feature first', placeholder: 'Example: Handmade leather cardholder' },
    { key: 'services', label: 'Purchase and delivery', hint: 'How customers can buy and receive products', placeholder: 'Example: Store pickup and shipping available' },
    { key: 'materials', label: 'Materials and care', hint: 'Actual materials and care instructions', placeholder: 'Example: Full-grain leather; clean with a dry cloth' },
  ],
  generic: [
    { key: 'services', label: 'Services', hint: 'What you currently provide', placeholder: 'Example: Brand strategy and design' },
    { key: 'caseStudies', label: 'Selected projects', hint: 'Only work that can be discussed publicly', placeholder: 'Example: Client-approved projects and your role' },
    { key: 'duration', label: 'Timeline', hint: 'The real time required for a consultation or service', placeholder: 'Example: Initial consultation, about 1 hour' },
    { key: 'specialties', label: 'Focus', hint: 'The work you focus on', placeholder: 'Example: Branding for independent retailers' },
  ],
};

const COMMON_FAQ_QUESTIONS: readonly GuidedFaqQuestion[] = [
  { id: 'hours', question: 'What are your hours?', hint: 'List hours by day and any regular closures.' },
  { id: 'parking', question: 'Where can I park?', hint: 'State availability, time limits, and cost.' },
  { id: 'reservation', question: 'How do I make an appointment?', hint: 'Give the real phone, form, or booking link.' },
  { id: 'payment', question: 'What forms of payment do you accept?', hint: 'List only the payment methods you accept.' },
  { id: 'accessibility', question: 'Is the location accessible?', hint: 'Describe the entrance, floor, elevator, and wheelchair access.' },
  { id: 'pets', question: 'Are pets allowed?', hint: 'State whether pets are allowed and any conditions.' },
];

const INDUSTRY_FAQ_QUESTIONS: Record<ContentIndustryGroup, readonly GuidedFaqQuestion[]> = {
  cafe: [
    { id: 'wifi', question: 'Do you have Wi-Fi and power outlets?', hint: 'State what is available and where.' },
    { id: 'group', question: 'Can you seat groups?', hint: 'Give the group size and reservation requirements.' },
    { id: 'takeout', question: 'Do you offer takeout?', hint: 'List eligible items and how to order.' },
  ],
  food: [
    { id: 'group', question: 'Do you take group reservations?', hint: 'Give the group size and reservation requirements.' },
    { id: 'corkage', question: 'Do you allow corkage?', hint: 'State bottle limits and fees.' },
    { id: 'takeout', question: 'Do you offer takeout or delivery?', hint: 'List only the options currently available.' },
  ],
  medical: [
    { id: 'appointment', question: 'Do I need an appointment?', hint: 'Explain scheduled and same-day availability.' },
    { id: 'insurance', question: 'How do I verify insurance coverage?', hint: 'State what the office can verify and how to ask.' },
    { id: 'documents', question: 'What should I bring?', hint: 'List only items patients actually need.' },
  ],
  beauty: [
    { id: 'duration', question: 'How long does the service take?', hint: 'Give the real time range for each service.' },
    { id: 'appointment', question: 'Do you take same-day appointments?', hint: 'State availability and how to book.' },
    { id: 'aftercare', question: 'What aftercare is recommended?', hint: 'Include only instructions you actually provide.' },
  ],
  workshop: [
    { id: 'materials', question: 'Are materials included?', hint: 'List what is included and what guests should bring.' },
    { id: 'duration', question: 'How long is the class?', hint: 'Give the real duration for each class.' },
    { id: 'group', question: 'Do you offer group classes?', hint: 'Give group size and booking requirements.' },
  ],
  education: [
    { id: 'enrollment', question: 'How do I enroll?', hint: 'Explain consultation, placement, and registration steps.' },
    { id: 'duration', question: 'How often does the class meet?', hint: 'Give session length and weekly frequency.' },
    { id: 'materials', question: 'Do I need books or supplies?', hint: 'List the materials actually used.' },
  ],
  legal: [
    { id: 'appointment', question: 'Do I need an appointment?', hint: 'Explain how to book and when appointments are available.' },
    { id: 'documents', question: 'What should I prepare?', hint: 'List common materials clients should bring.' },
    { id: 'duration', question: 'How long is the first consultation?', hint: 'Give the actual appointment length.' },
  ],
  retail: [
    { id: 'delivery', question: 'Do you ship or offer pickup?', hint: 'List the actual purchase and delivery options.' },
    { id: 'exchange', question: 'What is your return policy?', hint: 'State the policy and how customers start a return.' },
    { id: 'stock', question: 'How can I check availability?', hint: 'Give the phone, message, or online method.' },
  ],
  generic: [
    { id: 'appointment', question: 'How do I get started?', hint: 'Give the actual inquiry or booking method.' },
    { id: 'duration', question: 'How long does it take?', hint: 'Give the real expected duration.' },
    { id: 'documents', question: 'What should I prepare?', hint: 'List only materials clients actually need.' },
  ],
};

export function contentIndustryGroup(industry: string): ContentIndustryGroup {
  const value = industry.trim();
  if (/cafe|coffee|bakery|dessert|\uce74\ud398|\ucee4\ud53c|\ubca0\uc774\ucee4\ub9ac|\ub514\uc800\ud2b8/iu.test(value)) return 'cafe';
  if (/restaurant|dining|food|bar\b|\uc2dd\ub2f9|\uc74c\uc2dd|\ub2e4\uc774\ub2dd|\ud55c\uc2dd|\uc77c\uc2dd|\uc8fc\uc810/iu.test(value)) return 'food';
  if (/clinic|medical|dental|dentist|pharmacy|\ubcd1\uc6d0|\uc758\uc6d0|\uc758\ub8cc|\uce58\uacfc|\ud55c\uc758|\uc57d\uad6d|\ud074\ub9ac\ub2c9/iu.test(value)) return 'medical';
  if (/salon|beauty|hair|nail|massage|pilates|yoga|\ubbf8\uc6a9|\ud5e4\uc5b4|\ub124\uc77c|\ud53c\ubd80|\ubdf0\ud2f0|\uc0b4\ub871|\ub9c8\uc0ac\uc9c0/iu.test(value)) return 'beauty';
  if (/workshop|pottery|woodworking|craft|handmade|\uacf5\ubc29|\ub3c4\uc608|\ubaa9\uacf5|\uc218\uacf5\uc608|\ud578\ub4dc\uba54\uc774\ub4dc/iu.test(value)) return 'workshop';
  if (/school|education|academy|tutor|training|\ud559\uc6d0|\uad50\uc721|\uad50\uc2b5|\uacfc\uc678|\ud559\uad50/iu.test(value)) return 'education';
  if (/legal|law|attorney|tax|accounting|\ubc95\ub960|\ubc95\ubb34|\ubcc0\ud638|\uc138\ubb34|\ud68c\uacc4/iu.test(value)) return 'legal';
  if (/retail|shop|store|florist|bookstore|apparel|\uc18c\ub9e4|\uc0c1\uc810|\ud3b8\uc9d1\uc20d|\uc1fc\ud551|\uaf43\uc9d1|\uc11c\uc810|\uc758\ub958/iu.test(value)) return 'retail';
  return 'generic';
}

export function factQuestionsForIndustry(
  industry: string,
  purpose: LivePurposeId = 'local_store',
): BusinessFactQuestion[] {
  const questions = [...COMMON_FACT_QUESTIONS, ...INDUSTRY_FACT_QUESTIONS[contentIndustryGroup(industry)]];
  const required = new Set(requiredFactKeysFor(purpose));
  return [...new Map(questions.map((question) => [question.key, question])).values()]
    .map((question) => ({ ...question, required: required.has(question.key) }));
}

interface FactFaqRule {
  factKey: BusinessFactKey;
  outputQuestionId: string;
  coveredQuestionIds: readonly string[];
}

const COMMON_FACT_FAQ_RULES: readonly FactFaqRule[] = [
  { factKey: 'openingHours', outputQuestionId: 'hours', coveredQuestionIds: ['hours'] },
  { factKey: 'parking', outputQuestionId: 'parking', coveredQuestionIds: ['parking'] },
  { factKey: 'paymentMethods', outputQuestionId: 'payment', coveredQuestionIds: ['payment'] },
  { factKey: 'accessibility', outputQuestionId: 'accessibility', coveredQuestionIds: ['accessibility'] },
  { factKey: 'pets', outputQuestionId: 'pets', coveredQuestionIds: ['pets'] },
];

const INDUSTRY_FACT_FAQ_RULES: Record<ContentIndustryGroup, readonly FactFaqRule[]> = {
  cafe: [
    { factKey: 'reservation', outputQuestionId: 'reservation', coveredQuestionIds: ['reservation'] },
    { factKey: 'wifi', outputQuestionId: 'wifi', coveredQuestionIds: ['wifi'] },
    { factKey: 'groupSeating', outputQuestionId: 'group', coveredQuestionIds: ['group'] },
  ],
  food: [
    { factKey: 'reservation', outputQuestionId: 'reservation', coveredQuestionIds: ['reservation'] },
    { factKey: 'groupSeating', outputQuestionId: 'group', coveredQuestionIds: ['group'] },
    { factKey: 'services', outputQuestionId: 'takeout', coveredQuestionIds: ['takeout'] },
  ],
  medical: [
    { factKey: 'reservation', outputQuestionId: 'appointment', coveredQuestionIds: ['reservation', 'appointment'] },
    { factKey: 'insurance', outputQuestionId: 'insurance', coveredQuestionIds: ['insurance'] },
  ],
  beauty: [
    { factKey: 'reservation', outputQuestionId: 'appointment', coveredQuestionIds: ['reservation', 'appointment'] },
    { factKey: 'duration', outputQuestionId: 'duration', coveredQuestionIds: ['duration'] },
  ],
  workshop: [
    { factKey: 'reservation', outputQuestionId: 'reservation', coveredQuestionIds: ['reservation'] },
    { factKey: 'materials', outputQuestionId: 'materials', coveredQuestionIds: ['materials'] },
    { factKey: 'duration', outputQuestionId: 'duration', coveredQuestionIds: ['duration'] },
    { factKey: 'groupSeating', outputQuestionId: 'group', coveredQuestionIds: ['group'] },
  ],
  education: [
    { factKey: 'reservation', outputQuestionId: 'reservation', coveredQuestionIds: ['reservation'] },
    { factKey: 'duration', outputQuestionId: 'duration', coveredQuestionIds: ['duration'] },
    { factKey: 'materials', outputQuestionId: 'materials', coveredQuestionIds: ['materials'] },
  ],
  legal: [
    { factKey: 'reservation', outputQuestionId: 'appointment', coveredQuestionIds: ['reservation', 'appointment'] },
    { factKey: 'duration', outputQuestionId: 'duration', coveredQuestionIds: ['duration'] },
  ],
  retail: [
    { factKey: 'reservation', outputQuestionId: 'reservation', coveredQuestionIds: ['reservation'] },
    { factKey: 'services', outputQuestionId: 'delivery', coveredQuestionIds: ['delivery'] },
  ],
  generic: [
    { factKey: 'reservation', outputQuestionId: 'appointment', coveredQuestionIds: ['reservation', 'appointment'] },
    { factKey: 'duration', outputQuestionId: 'duration', coveredQuestionIds: ['duration'] },
  ],
};

function allFaqQuestionsForIndustry(industry: string): GuidedFaqQuestion[] {
  const questions = [...COMMON_FAQ_QUESTIONS, ...INDUSTRY_FAQ_QUESTIONS[contentIndustryGroup(industry)]];
  return [...new Map(questions.map((question) => [question.id, question])).values()];
}

function factFaqRulesForIndustry(industry: string): readonly FactFaqRule[] {
  return [...COMMON_FACT_FAQ_RULES, ...INDUSTRY_FACT_FAQ_RULES[contentIndustryGroup(industry)]];
}

/**
 * 네이버 FAQ 리치 결과는 2026-07-08 종료됐지만, 명시적 질문-답 구조는
 * 인덱싱·질문 매칭·AI 인용을 위한 가시 콘텐츠와 FAQPage 데이터에 계속 사용한다.
 */
export function faqQuestionsForIndustry(industry: string): GuidedFaqQuestion[] {
  const factCovered = new Set(
    factFaqRulesForIndustry(industry).flatMap((rule) => [...rule.coveredQuestionIds]),
  );
  return allFaqQuestionsForIndustry(industry).filter((question) => !factCovered.has(question.id));
}

export function resolveGuidedFaqAnswers(
  industry: string,
  answers: readonly GuidedFaqAnswer[],
  facts?: readonly BusinessFactAnswer[],
): { questionId: string; question: string; answer: string }[] {
  const answerById = new Map<string, string>();
  for (const item of answers) {
    const answer = item.answer.trim();
    if (answer) answerById.set(item.questionId, answer);
  }
  const derivedById = new Map<string, string>();
  if (facts) {
    const factValues = resolveBusinessFacts(facts);
    for (const rule of factFaqRulesForIndustry(industry)) {
      const hasLegacyAnswer = rule.coveredQuestionIds.some((questionId) => answerById.has(questionId));
      const value = factValues[rule.factKey];
      if (!hasLegacyAnswer && value) derivedById.set(rule.outputQuestionId, value);
    }
  }
  return allFaqQuestionsForIndustry(industry).flatMap((question) => {
    const answer = answerById.get(question.id) ?? derivedById.get(question.id);
    return answer ? [{ questionId: question.id, question: question.question, answer }] : [];
  });
}

/** 고객이 확인한 답변만 키별로 하나씩 남긴다. 마지막 답변 우선은 폼 수정 결과와 같다. */
export function resolveBusinessFacts(
  facts: readonly BusinessFactAnswer[],
): Readonly<Partial<Record<BusinessFactKey, string>>> {
  const resolved: Partial<Record<BusinessFactKey, string>> = {};
  for (const fact of facts) {
    const value = fact.value.trim();
    if (value) resolved[fact.key] = value;
  }
  return resolved;
}

const BRANDING_BY_GROUP: Record<ContentIndustryGroup, HonestBrandingCopy> = {
  cafe: {
    kicker: 'A place worth staying',
    title: 'Choose your drink.\nSettle in.',
    heroSub: 'The menu and visit details are easy to find, so the experience starts before the first sip.',
    paragraphs: [
      'The experience begins when a guest chooses a drink and continues for as long as they stay.',
      'The menu and practical details sit together, in the order a guest needs them.',
      'The site reflects the atmosphere of the cafe without making claims the source cannot support.',
    ],
    principles: [
      { title: 'A clear menu', description: 'Drinks, prices, and visit details appear where guests expect them.' },
      { title: 'An easy choice', description: 'Guests can decide what fits before they arrive.' },
      { title: 'One atmosphere', description: 'The site and the in-person experience should feel connected.' },
    ],
  },
  food: {
    kicker: 'Before the first plate',
    title: 'See the menu.\nPlan the meal.',
    heroSub: 'The menu and visit details are on the page, in plain language.',
    paragraphs: [
      'A good visit begins before a guest reaches the door.',
      'The menu, hours, and reservation details belong in one readable place.',
      'The site shows the restaurant’s point of view without adding unsupported claims.',
    ],
    principles: [
      { title: 'A readable menu', description: 'Names, prices, and descriptions are easy to scan.' },
      { title: 'Fewer unknowns', description: 'Guests can answer practical questions before they visit.' },
      { title: 'A consistent feel', description: 'The page sets an honest expectation for the meal.' },
    ],
  },
  medical: {
    kicker: 'Clear patient information',
    title: 'The answers patients need,\nwhere they can find them.',
    heroSub: 'Services, doctors, hours, and booking information are written as real page content.',
    paragraphs: [
      'Patients need clear information more than promotional language.',
      'Treatments, booking, and visit details appear in the order patients look for them.',
      'Only verified source material is shown. Questions that require judgment go back to the practice.',
    ],
    principles: [
      { title: 'Verified facts', description: 'Services and practice details come from approved source material.' },
      { title: 'Easy to navigate', description: 'Patients can find an answer and decide what to do next.' },
      { title: 'Plain language', description: 'The page explains without exaggerating.' },
    ],
  },
  beauty: {
    kicker: 'A considered choice',
    title: 'See the options.\nChoose at your pace.',
    heroSub: 'Services, timing, and booking information are easy to review before an appointment.',
    paragraphs: [
      'A considered decision starts with enough information and a straightforward conversation.',
      'Services, timing, and booking details appear in a useful order.',
      'The site reflects the studio without adding promises the source does not support.',
    ],
    principles: [
      { title: 'Useful details', description: 'Guests can review services and practical information first.' },
      { title: 'No pressure', description: 'The page makes room for an informed choice.' },
      { title: 'A consistent feel', description: 'The site and the visit should feel connected.' },
    ],
  },
  workshop: {
    kicker: 'Time to make something',
    title: 'See the class.\nKnow what to bring.',
    heroSub: 'Class details, materials, and preparation are clear before guests book.',
    paragraphs: [
      'The process matters as much as the finished piece.',
      'Classes, materials, and preparation details belong in one readable place.',
      'The site reflects the workshop without inventing outcomes.',
    ],
    principles: [
      { title: 'The process', description: 'Guests can understand the experience from start to finish.' },
      { title: 'What to prepare', description: 'Class and material details are easy to find.' },
      { title: 'The right pace', description: 'Guests can choose an experience that fits.' },
    ],
  },
  education: {
    kicker: 'The next step',
    title: 'Understand the course.\nChoose what fits.',
    heroSub: 'Course, schedule, and enrollment details are clear before a student applies.',
    paragraphs: [
      'Choosing a course starts with understanding the work and the direction.',
      'Classes, schedules, and preparation details sit in one place.',
      'The page explains the program without promising unsupported outcomes.',
    ],
    principles: [
      { title: 'A clear course', description: 'Students can see the sequence and preparation required.' },
      { title: 'An informed choice', description: 'The page gives students enough to decide what fits.' },
      { title: 'A steady direction', description: 'The process matters more than a quick promise.' },
    ],
  },
  legal: {
    kicker: 'Complex work, clearly explained',
    title: 'Understand the issue.\nKnow the next step.',
    heroSub: 'Practice areas and consultation details are clear before a client reaches out.',
    paragraphs: [
      'Complex matters need accurate, readable information rather than promotional language.',
      'Practice areas and preparation details appear where clients expect them.',
      'Only verified information is shown. Legal judgment stays with the professional.',
    ],
    principles: [
      { title: 'Verified information', description: 'Practice areas and contact details come from approved sources.' },
      { title: 'Readable language', description: 'A first-time visitor can follow the page.' },
      { title: 'A clear next step', description: 'Clients can decide whether to request a consultation.' },
    ],
  },
  retail: {
    kicker: 'Find what fits',
    title: 'See the collection.\nChoose with confidence.',
    heroSub: 'Product and purchase details are easy to review before a customer decides.',
    paragraphs: [
      'Discovering and choosing a product should feel straightforward.',
      'Product and purchase information belongs in one readable place.',
      'The site reflects the shop without adding unsupported claims.',
    ],
    principles: [
      { title: 'Easy discovery', description: 'Customers can browse without losing context.' },
      { title: 'Clear details', description: 'Product and purchase information is easy to find.' },
      { title: 'One point of view', description: 'The site and the shop should feel connected.' },
    ],
  },
  generic: {
    kicker: 'The useful details, in one place',
    title: 'Say what you do.\nMake the next step clear.',
    heroSub: 'Services and practical information are easy to read before a visitor acts.',
    paragraphs: [
      'A first-time visitor should understand what the business does.',
      'Services and practical details belong in one readable place.',
      'The page reflects the business without adding unsupported claims.',
    ],
    principles: [
      { title: 'Clear information', description: 'The useful details appear in the order visitors need them.' },
      { title: 'An informed choice', description: 'Visitors can review enough to choose a next step.' },
      { title: 'A consistent voice', description: 'The page keeps one clear point of view throughout.' },
    ],
  },
};

export function honestBrandingForIndustry(industry: string): HonestBrandingCopy {
  return BRANDING_BY_GROUP[contentIndustryGroup(industry)];
}

const STORY_CONTINUATION_BY_GROUP: Record<ContentIndustryGroup, readonly string[]> = {
  cafe: [
    'Guests should have time to choose a drink and settle in.',
    'The tone of the menu should carry through the entire visit.',
  ],
  food: [
    'The experience should feel clear from choosing a dish through the end of the meal.',
    'A readable menu says more than exaggerated copy.',
  ],
  medical: [
    'Patients should be able to find an answer and decide on a next step without added uncertainty.',
    'Verified information belongs in clear language on the page.',
  ],
  beauty: [
    'Guests should have room to discuss what they want and choose what fits.',
    'Enough information matters more than a dramatic promise.',
  ],
  workshop: [
    'Making something by hand should leave room for each guest’s pace.',
    'The materials and process matter as much as the result.',
  ],
  education: [
    'Students should understand the course before choosing a next step.',
    'A clear process matters more than a quick promise.',
  ],
  legal: [
    'Clients should be able to understand the issue and decide on a next step.',
    'Verified information and readable language matter more than certainty the source cannot support.',
  ],
  retail: [
    'Customers should be able to browse and choose without friction.',
    'The same point of view should carry from discovery through purchase.',
  ],
  generic: [
    'A first-time visitor should understand what the business does.',
    'The page should give visitors enough to choose a next step.',
  ],
};

function narrativeParagraphs(value: string | undefined): string[] {
  return (value ?? '')
    .split(/\n\s*\n|\r?\n/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

/**
 * MAIN v1 narrative model. Customer-authored story is copied verbatim after whitespace
 * normalization; empty slots are filled only with fixed attitude/aspiration copy.
 */
export function buildMainStorytellingModel(survey: SurveyInput): MainStorytellingModel {
  const base = buildContentDepthHomeModel(survey);
  const input = survey.contentDepth?.mainStorytelling;
  const customerStory = [
    ...narrativeParagraphs(input?.brandStory),
    ...narrativeParagraphs(input?.origin),
  ];
  const customerIntroduction = base.customerIntroduction.filter(
    (paragraph) => !customerStory.includes(paragraph),
  );
  const continuations = STORY_CONTINUATION_BY_GROUP[contentIndustryGroup(survey.industry)];
  const paragraphs = customerStory.length > 0
    ? [...customerStory, ...customerIntroduction, ...base.branding.paragraphs.slice(0, 2), ...continuations]
    : [...customerIntroduction, ...base.branding.paragraphs, ...continuations];
  const valuesLead = survey.contentDepth?.surveyBrief?.valueProposition?.trim()
    || input?.philosophy?.trim()
    || base.branding.paragraphs.at(-1)
    || base.branding.heroSub;

  return {
    kicker: customerStory.length > 0 ? 'Our story' : base.branding.kicker,
    title: customerStory.length > 0 ? `What ${survey.businessName} believes,\nmade visible` : base.branding.title,
    paragraphs,
    hasCustomerStory: customerStory.length > 0,
    valuesLead,
    values: base.strengths,
  };
}

function customerIntroduction(survey: SurveyInput): string[] {
  const accepted: string[] = [];
  const brief = survey.contentDepth?.surveyBrief;
  if (brief?.targetCustomer?.trim()) accepted.push(brief.targetCustomer.trim());
  if (brief?.visitorNeed?.trim()) accepted.push(brief.visitorNeed.trim());
  if (survey.tagline?.trim()) accepted.push(survey.tagline.trim());
  const sourceLines = survey.providedContent?.split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !/^\[[^\]]+\]$/u.test(line) && line !== survey.businessName) ?? [];
  for (const line of sourceLines) {
    if (accepted.includes(line) || line.length > 240) continue;
    accepted.push(line);
    if (accepted.length >= 3) break;
  }
  return accepted;
}

function uniqueCustomerGalleryImages(survey: SurveyInput): string[] {
  // URL이나 ref 단독은 권리 증거가 아니다. 신규 CONTENT 경로는 서버 검증을 거친
  // 일반 확약 ID와 URL-ref 쌍이 모두 보존된 사진만 factual 갤러리에 넣는다.
  if (!survey.generalAssetAttestationId) return [];
  const pairedUrls = new Set([
    ...(survey.storePhotoAssetRefs ?? []),
    ...(survey.importedPhotoAssetRefs ?? []),
    ...(survey.contentItems ?? []).flatMap((item) => item.photoAssetRef ? [item.photoAssetRef] : []),
  ].map((asset) => asset.url));
  const candidates = [
    ...(survey.storePhotoUrls ?? []).filter((url) => pairedUrls.has(url)),
    ...(survey.contentItems ?? []).flatMap((item) => (
      item.photoUrl && item.photoAssetRef?.url === item.photoUrl ? [item.photoUrl] : []
    )),
  ];
  return [...new Set(candidates.map((url) => url.trim()).filter(Boolean))].slice(0, 12);
}

/**
 * CONTENT v1의 홈 모델. 입력 사실과 고객 원문은 그대로 소비하고, 빈 슬롯은 만들지 않는다.
 * 나머지 문장은 검증 가능한 성과가 아니라 태도·탐색 경험만 말하는 고정 카탈로그다.
 */
export function buildContentDepthHomeModel(survey: SurveyInput): ContentDepthHomeModel {
  const facts = resolveBusinessFacts(survey.contentDepth?.facts ?? []);
  const baseBranding = honestBrandingForIndustry(survey.industry);
  const valueProposition = survey.contentDepth?.surveyBrief?.valueProposition?.trim();
  const branding = valueProposition
    ? { ...baseBranding, heroSub: valueProposition }
    : baseBranding;
  const customerStrengths = (survey.highlights ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 3);
  const strengths = customerStrengths.length > 0
    ? customerStrengths.map((title) => ({
        title,
        description: `This point comes directly from the information ${survey.businessName} provided: “${title}.”`,
      }))
    : [...branding.principles];
  const contentItems = (survey.contentItems ?? [])
    .map((item) => ({
      name: item.name.trim(),
      ...(item.price?.trim() ? { price: item.price.trim() } : {}),
      ...(item.description?.trim() ? { description: item.description.trim() } : {}),
    }))
    .filter((item) => item.name);
  const factRow = (key: BusinessFactKey): { label: string; value: string }[] => {
    const label = FACT_LABELS[key];
    const value = facts[key];
    return label && value ? [{ label, value }] : [];
  };
  return {
    branding,
    customerIntroduction: customerIntroduction(survey),
    strengths,
    contentItems,
    galleryImages: uniqueCustomerGalleryImages(survey),
    faq: resolveGuidedFaqAnswers(
      survey.industry,
      survey.contentDepth?.faqAnswers ?? [],
      survey.contentDepth?.surveyBrief ? survey.contentDepth.facts : undefined,
    )
      .map(({ question, answer }) => ({ question, answer })),
    directions: [
      ...factRow('address'),
      ...factRow('directions'),
      ...factRow('parking'),
      ...factRow('accessibility'),
    ],
    contact: [
      ...factRow('phone'),
      ...factRow('openingHours'),
      ...factRow('reservation'),
      ...factRow('paymentMethods'),
      ...factRow('pets'),
      ...factRow('wifi'),
    ],
  };
}

export function missingRequiredFacts(
  purpose: LivePurposeId,
  facts: readonly BusinessFactAnswer[],
): BusinessFactKey[] {
  const answered = new Set(facts.filter((fact) => fact.value.trim()).map((fact) => fact.key));
  return requiredFactKeysFor(purpose).filter((key) => !answered.has(key));
}

/** Extras UI와 MAIN 빌더가 같은 사실 슬롯으로 /directions 존재 여부를 판단한다. */
export function mainDirectionsPageEnabled(survey: SurveyInput): boolean {
  if (!survey.contentDepth?.mainStorytelling) return false;
  const facts = resolveBusinessFacts(survey.contentDepth.facts);
  return ['address', 'directions', 'parking', 'accessibility'].some((key) => Boolean(facts[key as BusinessFactKey]));
}
