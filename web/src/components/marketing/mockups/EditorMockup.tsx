'use client';

/**
 * [마케팅] 캔버스 에디터 목업 — 좌 섹션 리스트 + 중앙 미리보기 + 부유 드래그 블록(커서 동행).
 * 무한 반복 모션 1개(드래그 블록 y±6/rotate±1, 3.5s). transform만. reduced-motion: 정지.
 */
import { motion, useReducedMotion } from 'framer-motion';
import { MousePointer2 } from 'lucide-react';

const SECTIONS = ['히어로', '소개', '메뉴', '문의'];

export function EditorMockup({ className }: { className?: string }) {
  const reduce = useReducedMotion() ?? false;
  const float = reduce
    ? {}
    : {
        animate: { y: [0, -6, 0], rotate: [-1, 1, -1] },
        transition: { duration: 3.5, repeat: Infinity, ease: 'easeInOut' as const },
      };
  return (
    <div className={className}>
      <div className="flex gap-2">
        {/* 좌측 섹션 리스트 */}
        <div className="w-1/4 space-y-1.5">
          {SECTIONS.map((s, i) => (
            <div
              key={s}
              className={`rounded-md px-2 py-1.5 text-[10px] font-medium ${
                i === 0 ? 'bg-[#F3ECD8] text-[#7A5E1E]' : 'bg-[#F6F5F1] text-[#5C6068]'
              }`}
            >
              {s}
            </div>
          ))}
        </div>
        {/* 중앙 미리보기 */}
        <div className="relative min-h-[132px] flex-1 rounded-lg border border-[#E8E6E0] bg-[#FDFDFB] p-3">
          <div className="h-3 w-2/3 rounded bg-[#E8E6E0]" />
          <div className="mt-2 h-2 w-1/2 rounded bg-[#EDEBE4]" />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="h-10 rounded bg-[#F3F1EB]" />
            <div className="h-10 rounded bg-[#F3F1EB]" />
          </div>
          {/* 부유 드래그 블록 + 커서 */}
          <motion.div className="absolute top-7 right-3 flex items-start" {...float}>
            <span className="rounded-md border-2 border-dashed border-[#9A7B33] bg-[#FBF8F1] px-3 py-2 text-[10px] font-medium text-[#7A5E1E] shadow-sm">
              이미지 블록
            </span>
            <MousePointer2 className="-ml-1 mt-4 h-4 w-4 text-[#17181C]" />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
