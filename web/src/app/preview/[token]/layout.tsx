import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cache } from 'react';
import '@/app/globals.css';
import {
  APP_ROOT_BODY_CLASS_NAME,
  APP_ROOT_HTML_CLASS_NAME,
  APP_ROOT_METADATA,
} from '@/app/root-layout-contract';
import { isPreviewBearerToken } from '@/lib/crawl/preview-contract';
import { resolvePreviewDocumentPolicy } from '@/lib/crawl/preview-document-policy';
import { getSharedSitePreviewByToken } from '@/lib/crawl/repository';

const previewDocumentPolicyForToken = cache(async (token: string) => {
  if (!isPreviewBearerToken(token)) return resolvePreviewDocumentPolicy(null);
  const preview = await getSharedSitePreviewByToken(token);
  return resolvePreviewDocumentPolicy(preview?.siteConfig, preview?.renderMode);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const policy = await previewDocumentPolicyForToken(token);
  return {
    ...APP_ROOT_METADATA,
    ...(policy.preventMachineTranslation
      ? { other: { google: 'notranslate' } }
      : {}),
  };
}

export default async function PreviewRootLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const policy = await previewDocumentPolicyForToken(token);

  return (
    <html lang={policy.lang} className={APP_ROOT_HTML_CLASS_NAME}>
      <body suppressHydrationWarning className={APP_ROOT_BODY_CLASS_NAME}>
        {children}
      </body>
    </html>
  );
}
