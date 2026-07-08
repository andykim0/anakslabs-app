/**
 * [§5] 파일 맵 → zip 버퍼 (archiver).
 * Vercel Node 런타임 필요 — 호출 route에 runtime='nodejs', maxDuration=60.
 */
import 'server-only';
import { PassThrough } from 'node:stream';
import archiver from 'archiver';

/** 상대경로 → (문자열 또는 바이트) 맵을 zip 버퍼로 압축 */
export function zipFiles(files: Map<string, Buffer | string>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    const sink = new PassThrough();

    sink.on('data', (c: Buffer) => chunks.push(c));
    sink.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
    archive.on('warning', (err) => {
      // ENOENT 등 비치명 경고는 무시하지 않고 실패로 승격 (자산 누락 은닉 방지)
      reject(err);
    });

    archive.pipe(sink);
    for (const [name, content] of files) {
      archive.append(typeof content === 'string' ? Buffer.from(content, 'utf8') : content, { name });
    }
    void archive.finalize();
  });
}
