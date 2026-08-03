# AI 영상 히어로 수동 이행

크몽 수동 수금 고객의 영상 파일을 Anaks Labs Storage와 자산 registry에 등록하고 `/admin/video-queue`에서 이행 완료하는 운영 절차입니다. 이 절차는 영상을 생성하지 않으며, 등록 과정에서 외부 AI 호출이나 추가 비용이 발생하지 않습니다.

## 준비

- `/admin/video-queue`에서 대상 행이 `이행 대기`인지 확인합니다. 차단 표시가 있으면 먼저 원인을 해결합니다.
- 대상 사이트 ID, 선택한 히어로 사진, 선택 연출을 주문 내용과 대조합니다.
- 운영 셸에는 `NEXT_PUBLIC_MOCK_MODE=0`, Supabase URL·service-role key, `ASSET_PROVENANCE_V2_WRITE=1`이 설정되어 있어야 합니다. 키를 브라우저·문서·Git에 복사하지 않습니다.
- 로컬에 `ffmpeg`와 `ffprobe`가 설치되어 있어야 합니다. URL 등록은 공개 IPv4로 해석되는 HTTPS 호스트만 지원합니다.

## 1. 영상 생성·인코딩

승인된 고객별 Anaks Labs AI(Veo) 수동 생성 절차로 6~8초, 1920×1080 원본을 만들고, 고객이 선택한 히어로 소스와 연출인지 눈으로 확인합니다. 다른 가게의 영상이나 제품·시술 결과를 날조한 영상을 사용하지 않습니다.

스크럽용 파일은 해상도를 자동으로 낮추지 않고 MP4/H.264/yuv420p, 무음 all-intra로 인코딩합니다. 등록 검사는 인코더·컨테이너 오차를 고려해 5.5~8.5초만 허용하며, 신규 등록분은 1920×1080과 평균 4Mbps 이상을 함께 만족해야 합니다.

```bash
ffmpeg -i veo-raw.mp4 \
  -map 0:v:0 -an \
  -c:v libx264 -preset slow -crf 26 \
  -g 1 -keyint_min 1 -sc_threshold 0 \
  -pix_fmt yuv420p -movflags +faststart \
  cinematic-g1.mp4
```

3MiB 초과는 운영 경고이고 8MiB 초과는 등록 차단입니다. 8MiB를 넘으면 CRF를 조금씩 올려 다시 인코딩하고 육안 검수하되 평균 4Mbps 아래로 내리지 않습니다. 해상도 강등이나 낮은 비트레이트로의 과압축은 자동으로 하지 않습니다.

## 2. registry 등록

로컬 파일을 등록합니다.

```bash
node --env-file=.env.local ./node_modules/.bin/tsx \
  --tsconfig scripts/tsconfig.json \
  scripts/register-fulfillment-video.ts \
  --site-id 11111111-1111-4111-8111-111111111111 \
  --file /absolute/path/cinematic-g1.mp4
```

HTTPS URL만 가진 경우:

```bash
node --env-file=.env.local ./node_modules/.bin/tsx \
  --tsconfig scripts/tsconfig.json \
  scripts/register-fulfillment-video.ts \
  --site-id 11111111-1111-4111-8111-111111111111 \
  --url https://storage.example/video.mp4
```

URL은 provenance가 아닙니다. 스크립트는 각 HTTPS 리다이렉트마다 DNS 결과를 검사하고 검증한 공개 IPv4에 연결을 고정하되 원래 Host와 TLS SNI를 유지합니다. DNS·리다이렉트·본문 전체를 합쳐 60초, 스트리밍 본문은 8MiB로 제한합니다. 받은 MP4 바이트를 Anaks Labs `ai-assets`에 다시 저장한 뒤 `(storage bucket, storage key)` identity를 등록합니다. `clientId`, origin과 사이트 귀속은 CLI가 아니라 서버가 결정합니다.

쓰기 전 검사만 하려면 `--dry-run`을 추가합니다. 실제 등록 성공 시 마지막 줄의 UUID를 복사합니다.

```text
VIDEO_ASSET_ID=22222222-2222-4222-8222-222222222222
```

## 3. 큐 완료

1. `/admin/video-queue`의 같은 사이트 행에 `VIDEO_ASSET_ID` 값만 붙여넣습니다. URL은 입력하지 않습니다.
2. 히어로 사진과 생성 영상을 마지막으로 다시 대조합니다.
3. `이행 완료`를 누릅니다.
4. 행이 대기 큐에서 사라지고 최근 이행 이력에 나타나는지 확인합니다.
5. 초안과 발행본에서 데스크톱 스크럽, 모바일 루프, reduced-motion 포스터를 확인합니다.
6. 기존 정적 export가 무효화되어 다음 export에서 새 영상이 수집되는지 확인합니다.

완료 기록은 append-only이며 다른 UUID로 덮어쓸 수 없습니다. 잘못 등록했지만 아직 완료하지 않은 UUID는 사용하지 말고, 잘못 완료했다면 임의 수정·삭제하지 말고 코드와 이력을 보존한 채 별도 정정 절차로 에스컬레이션합니다. `ai_generated` 등록은 해당 영상을 실제 제품·실제 사례 같은 factual 슬롯에 사용할 권한을 부여하지 않습니다.

## 실패 확인

- `OPS_VIDEO_REAL_MODE_REQUIRED`: mock 모드입니다. 운영 DB에 아무것도 등록되지 않았습니다.
- `OPS_VIDEO_PROVENANCE_WRITE_REQUIRED`: registry WRITE 플래그가 꺼져 있습니다. URL-only 성공으로 강등하지 않습니다.
- `OPS_VIDEO_QUEUE_*`: 애드온 승인·명시적 요청·자산 정책·히어로 poster 상태를 큐에서 확인합니다.
- `OPS_VIDEO_GOP_INVALID`: 모든 프레임이 키프레임이 아닙니다. `-g 1`로 다시 인코딩합니다.
- `OPS_VIDEO_AUDIO_FORBIDDEN`: `-an`으로 다시 인코딩합니다.
- `OPS_VIDEO_CODEC_INVALID`: H.264/yuv420p로 다시 인코딩합니다.
- `OPS_VIDEO_GEOMETRY_INVALID`: 1920×1080 원본인지 확인합니다.
- `OPS_VIDEO_QUALITY_INVALID`: 평균 4Mbps 이상인지 확인하고 과압축 없이 다시 인코딩합니다.
- `OPS_VIDEO_DURATION_INVALID`: 6~8초 원본을 다시 확인합니다.
- `OPS_VIDEO_SIZE_BLOCKED`: 8MiB 이하로 다시 인코딩합니다.
- `OPS_VIDEO_URL_BLOCKED`, `OPS_VIDEO_URL_DNS_FAILED`: URL 호스트가 공개 IPv4로만 해석되는지 확인합니다.
- `OPS_VIDEO_URL_TIMEOUT`: DNS부터 본문 완료까지 60초를 넘었습니다. 파일을 로컬로 안전하게 내려받아 `--file`로 등록합니다.
- registry 오류 뒤에는 UUID가 출력되지 않습니다. URL만으로 큐 완료를 시도하지 않습니다.
