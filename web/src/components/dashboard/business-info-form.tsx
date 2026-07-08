'use client';

/**
 * [§6] 사업자 정보 입력/수정 폼 — 발행 게이트 해소 + 법적 푸터/법무 페이지 소스.
 * 전자상거래법·정보통신망법 표시 의무 항목.
 */
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Save } from 'lucide-react';
import type { BusinessInfo } from '@/lib/types/domain';
import { updateBusinessInfo } from './api';
import { useToast } from './toast';
import { Button, Card } from './ui';

const schema = z.object({
  legalName: z.string().min(1, '상호(법인명)를 입력해 주세요.').max(100),
  representative: z.string().min(1, '대표자명을 입력해 주세요.').max(60),
  bizRegNo: z.string().min(1, '사업자등록번호를 입력해 주세요.').max(40),
  address: z.string().min(1, '사업장 주소를 입력해 주세요.').max(300),
  phone: z.string().min(1, '연락처 전화를 입력해 주세요.').max(40),
  email: z.string().email('올바른 이메일 형식이 아닙니다.').max(120),
  ecommerceRegNo: z.string().max(60).optional(),
});

type FormValues = z.infer<typeof schema>;

const FIELDS: { name: keyof FormValues; label: string; placeholder: string; optional?: boolean }[] = [
  { name: 'legalName', label: '상호(법인명)', placeholder: '화로담' },
  { name: 'representative', label: '대표자명', placeholder: '김대표' },
  { name: 'bizRegNo', label: '사업자등록번호', placeholder: '123-45-67890' },
  { name: 'address', label: '사업장 주소', placeholder: '서울특별시 마포구 …' },
  { name: 'phone', label: '연락처(전화)', placeholder: '02-123-4567' },
  { name: 'email', label: '연락처(이메일)', placeholder: 'owner@example.com' },
  { name: 'ecommerceRegNo', label: '통신판매업 신고번호 (선택)', placeholder: '제2026-서울마포-1234호', optional: true },
];

export function BusinessInfoForm({ initial }: { initial: BusinessInfo | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      legalName: initial?.legalName ?? '',
      representative: initial?.representative ?? '',
      bizRegNo: initial?.bizRegNo ?? '',
      address: initial?.address ?? '',
      phone: initial?.phone ?? '',
      email: initial?.email ?? '',
      ecommerceRegNo: initial?.ecommerceRegNo ?? '',
    },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      updateBusinessInfo({ ...values, ecommerceRegNo: values.ecommerceRegNo || undefined }),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['business-info'] });
      reset({ ...saved, ecommerceRegNo: saved.ecommerceRegNo ?? '' });
      toast('success', '사업자 정보가 저장됐어요. 이제 사이트를 발행할 수 있습니다.');
    },
    onError: (err) => {
      toast('error', err instanceof Error ? err.message : '사업자 정보 저장에 실패했습니다.');
    },
  });

  return (
    <Card className="mt-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-neutral-400">
          <Building2 className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-neutral-200">사업자 정보</h2>
          <p className="mt-1 text-xs leading-5 text-neutral-500">
            전자상거래법·정보통신망법상 표시 의무 항목입니다. 발행 시 사이트 최하단 푸터와
            개인정보처리방침·이용약관에 자동 반영됩니다. <span className="text-neutral-400">발행 전 입력 필수.</span>
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate className="mt-4 grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.name} className={f.name === 'address' ? 'sm:col-span-2' : ''}>
            <div className="mb-1 flex items-baseline justify-between">
              <label className="text-[11px] text-neutral-500">{f.label}</label>
              {errors[f.name] ? <span className="text-[11px] text-red-400">{errors[f.name]?.message}</span> : null}
            </div>
            <input
              {...register(f.name)}
              placeholder={f.placeholder}
              className="h-10 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-[#c8a96a]"
            />
          </div>
        ))}
        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" loading={mutation.isPending} disabled={!isDirty && !!initial}>
            <Save className="h-4 w-4" />
            사업자 정보 저장
          </Button>
        </div>
      </form>
    </Card>
  );
}
