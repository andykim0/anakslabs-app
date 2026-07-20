import { openClipScene } from './open-clip';
import { typographyHeroScene } from './typography-hero';

const sceneFactories = {
  'typography-hero': typographyHeroScene,
  'open-clip': openClipScene,
} as const;

export type ParameterizedSceneId = keyof typeof sceneFactories;

export function isParameterizedSceneId(value: string): value is ParameterizedSceneId {
  return Object.hasOwn(sceneFactories, value);
}

export async function renderParameterizedScene(sceneId: ParameterizedSceneId, variables: unknown): Promise<string> {
  return sceneFactories[sceneId](variables);
}
