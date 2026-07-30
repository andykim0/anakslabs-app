import manifest from './edom-image-manifest.generated.json';
import type {
  KoClinicOptimizedImage,
  KoClinicUnavailableImage,
} from './contracts';

interface EdomImageManifest {
  version: 1;
  expectedManifestSha256: string;
  generatedAt: string;
  assets: KoClinicOptimizedImage[];
  unavailable: KoClinicUnavailableImage[];
}

export function edomClinicImageManifest(): EdomImageManifest {
  return manifest as EdomImageManifest;
}
