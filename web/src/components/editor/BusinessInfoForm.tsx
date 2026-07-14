'use client';

/**
 * [v3 Phase 4] 사업자 정보 폼 — 에디터 모달과 발행 다이얼로그 1단계가 공용.
 * RHF + zod(businessInfoSchema 단일 소스 — 사업자등록번호 000-00-00000, 전화 검증,
 * isPersonal=true면 상호/사업자번호/주소 생략).
 * 저장은 스토어 setBusinessInfo → draftConfig 합성 자동저장 흐름을 그대로 탄다.
 */
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { BusinessInfo } from '@/lib/types/site';
import { businessInfoSchema } from '@/app/api/_lib/schemas';
import { cn } from '@/components/dashboard/ui';

// z.input은 preprocess(email) 탓에 unknown이 섞여 명시 타입 사용 — 검증은 동일 스키마가 수행
interface FormValues {
  isPersonal?: boolean;
  businessName?: string;
  ownerName: string;
  businessNumber?: string;
  address?: string;
  phone: string;
  email?: string;
  mailOrderNumber?: string;
}

const inputClass =
  'h-9 w-full rounded-lg border border-[#CAD5E5] bg-white px-3 text-sm text-[#0B1736] outline-none transition-colors placeholder:text-[#667085] focus:border-[#174DDA]';

function Field({
  label,
  error,
  children,
  span2,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  span2?: boolean;
}) {
  return (
    <div className={span2 ? 'sm:col-span-2' : undefined}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-[#667085]">{label}</span>
        {error ? <span className="text-[11px] text-red-400">{error}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** BusinessInfo → 폼 기본값 (undefined → '') */
function toDefaults(initial: BusinessInfo | null): FormValues {
  return {
    isPersonal: initial?.isPersonal ?? false,
    businessName: initial?.businessName ?? '',
    ownerName: initial?.ownerName ?? '',
    businessNumber: initial?.businessNumber ?? '',
    address: initial?.address ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    mailOrderNumber: initial?.mailOrderNumber ?? '',
  };
}

/** 폼 값 → BusinessInfo (빈 문자열 필드 제거) */
function toBusinessInfo(values: FormValues): BusinessInfo {
  const clean = (v?: string) => (v && v.trim() ? v.trim() : undefined);
  const personal = values.isPersonal === true;
  return {
    ...(personal ? { isPersonal: true } : {}),
    businessName: personal ? clean(values.businessName) : values.businessName?.trim(),
    ownerName: values.ownerName.trim(),
    businessNumber: personal ? clean(values.businessNumber) : values.businessNumber?.trim(),
    address: personal ? clean(values.address) : values.address?.trim(),
    phone: values.phone.trim(),
    email: clean(values.email),
    mailOrderNumber: clean(values.mailOrderNumber),
  };
}

export function BusinessInfoForm({
  initial,
  onSave,
  submitLabel = '저장',
  extraActions,
}: {
  initial: BusinessInfo | null;
  onSave: (info: BusinessInfo) => void;
  submitLabel?: string;
  /** 제출 버튼 왼쪽에 렌더할 부가 액션 (예: 취소) */
  extraActions?: React.ReactNode;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(businessInfoSchema) as unknown as Resolver<FormValues>,
    defaultValues: toDefaults(initial),
  });

  const isPersonal = watch('isPersonal') === true;

  return (
    <form
      onSubmit={handleSubmit((values) => onSave(toBusinessInfo(values)))}
      noValidate
      className="space-y-3"
      // 에디터 단축키(Delete 등)와 충돌 방지
      onKeyDown={(e) => e.stopPropagation()}
    >
      {/* 개인 토글 */}
      <button
        type="button"
        onClick={() => setValue('isPersonal', !isPersonal, { shouldValidate: true })}
        className={cn(
          'flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors',
          isPersonal ? 'border-[#174DDA] bg-[#EDF4FF]' : 'border-[#CAD5E5] hover:border-[#AEBACC]',
        )}
      >
        <span>
          <span className={cn('block text-xs font-medium', isPersonal ? 'text-[#174DDA]' : 'text-[#344054]')}>
            사업자가 아닌 개인 사이트예요
          </span>
          <span className="mt-0.5 block text-[10px] text-[#667085]">
            개인 운영이면 운영자명·연락처만 입력하면 돼요.
          </span>
        </span>
        <span
          role="switch"
          aria-checked={isPersonal}
          className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', isPersonal ? 'bg-[#174DDA]' : 'bg-[#DCE4F0]')}
        >
          <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-[#F8FBFF] transition-transform', isPersonal ? 'translate-x-4' : 'translate-x-0.5')} />
        </span>
      </button>

      <div className="grid gap-3 sm:grid-cols-2">
        {!isPersonal ? (
          <Field label="상호 (법인명)" error={errors.businessName?.message}>
            <input {...register('businessName')} placeholder="예: 살롱 피즈" className={inputClass} />
          </Field>
        ) : null}
        <Field label={isPersonal ? '운영자명' : '대표자명'} error={errors.ownerName?.message} span2={isPersonal}>
          <input {...register('ownerName')} placeholder="예: 김대표" className={inputClass} />
        </Field>
        {!isPersonal ? (
          <>
            <Field label="사업자등록번호" error={errors.businessNumber?.message}>
              <input {...register('businessNumber')} placeholder="000-00-00000" className={inputClass} />
            </Field>
            <Field label="사업장 주소" error={errors.address?.message}>
              <input {...register('address')} placeholder="예: 서울시 마포구 …" className={inputClass} />
            </Field>
          </>
        ) : null}
        <Field label="연락처 (전화)" error={errors.phone?.message}>
          <input {...register('phone')} placeholder="02-000-0000" className={inputClass} />
        </Field>
        <Field label="이메일 (선택)" error={errors.email?.message}>
          <input {...register('email')} placeholder="owner@example.com" className={inputClass} />
        </Field>
        {!isPersonal ? (
          <Field label="통신판매업 신고번호 (선택)" error={errors.mailOrderNumber?.message} span2>
            <input {...register('mailOrderNumber')} placeholder="제2026-서울마포-1234호" className={inputClass} />
          </Field>
        ) : null}
      </div>

      <p className="text-[11px] leading-4 text-[#667085]">
        발행된 사이트 최하단에 법적 표기 푸터로 자동 표시됩니다 (전자상거래법·정보통신망법 표시 의무).
      </p>

      <div className="flex items-center justify-end gap-2 pt-1">
        {extraActions}
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-lg bg-[#174DDA] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#245FE5]"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
