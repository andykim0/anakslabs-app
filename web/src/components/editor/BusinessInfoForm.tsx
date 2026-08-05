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
  'h-9 w-full rounded-lg border border-[#D9DAE0] bg-white px-3 text-sm text-[#141A3A] outline-none transition-colors placeholder:text-[#6a7286] focus:border-[#2D63F0]';

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
        <span className="text-[11px] text-[#6a7286]">{label}</span>
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
  submitLabel = "Save",
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

  // eslint-disable-next-line react-hooks/incompatible-library -- React Hook Form owns this reactive field subscription.
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
          isPersonal ? 'border-[#2D63F0] bg-[#EAEFFE]' : 'border-[#D9DAE0] hover:border-[#AEBACC]',
        )}
      >
        <span>
          <span className={cn('block text-xs font-medium', isPersonal ? 'text-[#2D63F0]' : 'text-[#344054]')}>
            This is a personal site, not a business.
          </span>
          <span className="mt-0.5 block text-[10px] text-[#6a7286]">
            If it is a private operation, you only need to enter the operator name and contact information.
          </span>
        </span>
        <span
          role="switch"
          aria-checked={isPersonal}
          className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', isPersonal ? 'bg-[#2D63F0]' : 'bg-[#DFE1E6]')}
        >
          <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-[#F6F7F9] transition-transform', isPersonal ? 'translate-x-4' : 'translate-x-0.5')} />
        </span>
      </button>

      <div className="grid gap-3 sm:grid-cols-2">
        {!isPersonal ? (
          <Field label="Company name (corporate name)" error={errors.businessName?.message}>
            <input {...register('businessName')} placeholder="Example: Salon Fizz" className={inputClass} />
          </Field>
        ) : null}
        <Field label={isPersonal ? "operator name" : "Representative name"} error={errors.ownerName?.message} span2={isPersonal}>
          <input {...register('ownerName')} placeholder="Example: Representative Kim" className={inputClass} />
        </Field>
        {!isPersonal ? (
          <>
            <Field label="Business registration number" error={errors.businessNumber?.message}>
              <input {...register('businessNumber')} placeholder="000-00-00000" className={inputClass} />
            </Field>
            <Field label="business address" error={errors.address?.message}>
              <input {...register('address')} placeholder="Example: Mapo-gu, Seoul…" className={inputClass} />
            </Field>
          </>
        ) : null}
        <Field label="Contact (Phone)" error={errors.phone?.message}>
          <input {...register('phone')} placeholder="02-000-0000" className={inputClass} />
        </Field>
        <Field label="Email (optional)" error={errors.email?.message}>
          <input {...register('email')} placeholder="owner@example.com" className={inputClass} />
        </Field>
        {!isPersonal ? (
          <Field label="Mail order business report number (optional)" error={errors.mailOrderNumber?.message} span2>
            <input {...register('mailOrderNumber')} placeholder="No. 2026-Seoul Mapo-1234" className={inputClass} />
          </Field>
        ) : null}
      </div>

      <p className="text-[11px] leading-4 text-[#6a7286]">
        It is automatically displayed as a legal notation footer at the bottom of the published site (display obligation under the Electronic Commerce Act and the Information and Communications Network Act).
      </p>

      <div className="flex items-center justify-end gap-2 pt-1">
        {extraActions}
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-lg bg-[#2D63F0] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#2F6BFF]"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
