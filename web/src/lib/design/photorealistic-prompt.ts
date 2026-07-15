/**
 * Deterministic photographic prompt expansion inspired by Qwen-Image 2512's
 * prompt_utils_2512.py (Apache-2.0):
 * https://github.com/QwenLM/Qwen-Image/blob/main/src/examples/tools/prompt_utils_2512.py
 *
 * Qwen's example asks qwen-plus to turn a short request into a concrete scene.
 * Anakslabs already knows the scene taxonomy, so this module performs the same
 * expansion locally: subject + spatial layers + light + camera + materials.
 * It never calls Qwen/DashScope and never accepts untrusted free-form subjects.
 */
import type { MoodSubjectId } from '@/lib/design/image-subjects';

interface EnvironmentScene {
  setting: string;
  foreground: string;
  midground: string;
  background: string;
}

interface ShotRecipe {
  shot: string;
  angle: string;
  lens: string;
  aperture: string;
  depth: string;
}

export interface PhotorealisticPromptInput {
  role: string;
  businessContext: string;
  ambientSubject: string;
  mood: string;
  moodId: MoodSubjectId;
  colorMood?: string;
  seed: string;
}

/**
 * Concrete environments make photographic geometry and material behavior
 * possible without inventing an orderable product or a service result.
 */
const ENVIRONMENTS: Readonly<Record<string, EnvironmentScene>> = {
  'cozy cafe and bakery': {
    setting: 'a real neighborhood cafe interior shortly before opening',
    foreground: 'the edge of a solid timber counter with subtle wear and a few plain ceramic cups',
    midground: 'an unoccupied service counter, stainless equipment, and naturally spaced seating',
    background: 'softly textured plaster walls, shelving silhouettes, and daylight from a street-facing window',
  },
  'restaurant dining': {
    setting: 'an intimate restaurant dining room shortly before service',
    foreground: 'the edge of an empty walnut table with naturally folded linen and clean glassware',
    midground: 'unoccupied tables, tactile chairs, and a clear aisle through the room',
    background: 'an open-kitchen threshold, stone surfaces, and restrained pendant lights falling softly out of focus',
  },
  'beauty salon': {
    setting: 'a quiet professional beauty salon before the first appointment',
    foreground: 'a clean stone work surface with neatly arranged unbranded tools',
    midground: 'an empty styling chair, a large mirror, and a softly illuminated workstation',
    background: 'textured walls, concealed storage, and a calm corridor receding naturally from view',
  },
  'medical clinic': {
    setting: 'a calm contemporary medical clinic before opening hours',
    foreground: 'a clean reception ledge with realistic stone grain and softly rounded edges',
    midground: 'an unoccupied waiting area with supportive seating and uncluttered circulation space',
    background: 'frosted-glass partitions and a bright corridor with even, reassuring illumination',
  },
  'professional law and consulting office': {
    setting: 'a composed professional consulting office prepared for a client meeting',
    foreground: 'the edge of a dark timber conference table with subtle grain and natural surface variation',
    midground: 'structured seating, a restrained floor lamp, and balanced open space',
    background: 'architectural shelving, translucent glass, and a softly receding office corridor',
  },
  'education academy': {
    setting: 'a welcoming education studio prepared before a lesson',
    foreground: 'the corner of a clean timber desk with a closed unmarked notebook and a simple pencil',
    midground: 'orderly empty desks with comfortable spacing and practical task lighting',
    background: 'a blank teaching wall, acoustic panels, and soft daylight entering from tall windows',
  },
  'fitness studio': {
    setting: 'a real boutique movement studio between sessions',
    foreground: 'a clean exercise mat on a timber floor with visible natural grain',
    midground: 'carefully spaced unoccupied equipment and open room for movement',
    background: 'a softly reflective wall, exposed structural details, and high windows filtering daylight',
  },
  'flower and plant shop': {
    setting: 'an airy neighborhood plant studio before opening',
    foreground: 'a worn timber work surface with raw paper, twine, and scattered leaf shadows',
    midground: 'open shelving and varied natural foliage arranged as part of the interior atmosphere',
    background: 'limewashed walls and a glazed storefront diffusing early daylight',
  },
  'tech product studio': {
    setting: 'a focused contemporary technology studio during a quiet workday',
    foreground: 'the edge of a matte worktable with realistic surface texture and restrained cable detail',
    midground: 'unoccupied ergonomic workstations, soft task lights, and a collaborative open area',
    background: 'acoustic panels, glass partitions, and architectural lines fading into natural depth',
  },
  'kids studio': {
    setting: 'a bright supervised activity studio prepared before opening',
    foreground: 'a low rounded timber table with tactile natural grain and safely softened edges',
    midground: 'open floor space, simple unbranded forms, and neatly organized storage',
    background: 'warm acoustic wall panels and large windows filling the empty room with gentle daylight',
  },
  'craft workshop': {
    setting: 'a working craft studio between making sessions',
    foreground: 'a scarred timber workbench with raw material samples and well-used hand tools',
    midground: 'sturdy stools, unfinished work surfaces, and practical overhead task lighting',
    background: 'open shelving, a utility sink, and workshop walls with authentic age and texture',
  },
  'retail brand': {
    setting: 'a carefully designed retail interior before opening',
    foreground: 'a tactile display plinth with realistic stone grain and softly worn edges',
    midground: 'open circulation space, restrained fixtures, and unbranded fabric silhouettes',
    background: 'layered curtains, architectural shelving, and a softly glowing storefront',
  },
  'photography studio': {
    setting: 'a professional photography studio prepared between sessions',
    foreground: 'the edge of a matte worktable with clamps and neatly coiled cable',
    midground: 'an empty cyclorama, folded light stand, and large diffusion frame',
    background: 'high industrial windows, painted brick, and equipment fading into soft natural depth',
  },
  'local service shop': {
    setting: 'a tidy neighborhood service workshop before opening',
    foreground: 'a durable work surface with honest wear and neatly arranged unbranded tools',
    midground: 'an open customer area, practical storage, and a clear working aisle',
    background: 'painted masonry, a glazed entrance, and softly lit architectural detail',
  },
  'boutique stay': {
    setting: 'a quiet boutique-stay lobby in the first light of morning',
    foreground: 'the edge of a low timber table with visible grain and naturally creased linen nearby',
    midground: 'deep lounge seating, a textured rug, and generous walking space',
    background: 'a stone reception wall, sheer curtains, and a corridor receding into warm practical light',
  },
  'local business': {
    setting: 'a believable independent local-business interior shortly before opening',
    foreground: 'a tactile work surface with context-appropriate signs of normal use',
    midground: 'unoccupied furnishings arranged with practical, human-scale spacing',
    background: 'textured architecture, a real entrance, and layered daylight creating natural depth',
  },
};

const LIGHTING: Readonly<Record<MoodSubjectId, string>> = {
  elegant:
    'soft directional window light from one side, restrained warm practical lights, deep but detailed shadows, and smooth highlight roll-off',
  warm:
    'late-morning window light with a warm-neutral white balance, gentle bounced fill, and soft-edged shadows',
  calm:
    'broad diffused daylight with low contrast, quiet tonal transitions, and subtle ambient fill',
  modern:
    'clean directional daylight balanced with neutral practical lighting, crisp geometry, and controlled reflections',
  natural:
    'filtered daylight broken gently by foliage or sheer fabric, soft bounce light, and true-to-life earth tones',
  energetic:
    'strong low-angle daylight creating purposeful diagonal shadows, controlled contrast, and retained highlight detail',
};

function stableIndex(seed: string, size: number): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % size;
}

function shotRecipe(role: string): ShotRecipe {
  if (role.startsWith('hero')) {
    return {
      shot: 'wide environmental commercial photograph',
      angle: 'at natural eye level with straight, believable architectural lines',
      lens: 'a full-frame camera and a 35mm prime lens',
      aperture: 'f/4',
      depth: 'clear environmental detail with gentle optical falloff into the far background',
    };
  }
  if (role.startsWith('editorial gallery')) {
    return {
      shot: 'medium environmental detail photograph',
      angle: 'from a slightly off-axis observational angle',
      lens: 'a full-frame camera and a 50mm prime lens',
      aperture: 'f/2.8',
      depth: 'a precisely focused material plane with natural foreground and background separation',
    };
  }
  if (role.startsWith('welcoming contact')) {
    return {
      shot: 'wide location-establishing photograph',
      angle: 'from a welcoming eye-level position near the entrance',
      lens: 'a full-frame camera and a 35mm prime lens',
      aperture: 'f/5.6',
      depth: 'legible architecture and realistic depth through the entire space',
    };
  }
  return {
    shot: 'medium-wide editorial environmental photograph',
    angle: 'from a natural standing viewpoint with a subtle off-axis perspective',
    lens: 'a full-frame camera and a 50mm prime lens',
    aperture: 'f/3.2',
    depth: 'a clear focal plane with physically plausible gradual lens falloff',
  };
}

/**
 * Expands a safe, short scene into the photographic dimensions used by Qwen's
 * prompt enhancer. The output stays one natural paragraph for Gemini.
 */
export function buildPhotorealisticPhotoPrompt(input: PhotorealisticPromptInput): string {
  const environment = ENVIRONMENTS[input.businessContext] ?? ENVIRONMENTS['local business'];
  const shot = shotRecipe(input.role);
  const copySide = stableIndex(`${input.seed}:copy-space`, 2) === 0 ? 'left' : 'right';
  const sceneSide = copySide === 'left' ? 'right' : 'left';
  const composition = input.role.startsWith('hero')
    ? `Compose the spatial focus on the ${sceneSide} third and preserve clean, naturally lit copy space on the ${copySide} without making the room look empty.`
    : 'Use an intentional asymmetrical composition with breathing room around the focal plane.';
  const colorMood = input.colorMood ? `Color direction: ${input.colorMood}. ` : '';

  return (
    `A photorealistic ${shot.shot} of ${environment.setting}. ` +
    `Primary environmental focus: ${input.ambientSubject}, integrated naturally into the real space. ` +
    `Foreground: ${environment.foreground}. Midground: ${environment.midground}. Background: ${environment.background}. ` +
    `Lighting: ${LIGHTING[input.moodId]}. ` +
    `Camera: photographed ${shot.angle} using ${shot.lens} at ${shot.aperture}; ${shot.depth}. ` +
    `${composition} Mood and art direction: ${input.mood}. ${colorMood}` +
    'Preserve physically accurate perspective and scale, natural exposure roll-off, true-to-life white balance, accurate contact shadows and reflections, and context-appropriate material micro-texture. ' +
    'Retain subtle surface variation, tiny scuffs, irregular fabric folds, and natural edge detail with restrained professional color grading. ' +
    `The result should read as a bespoke photograph captured on location by a professional photographer. Website image role: ${input.role}. ` +
    `Business-setting context only: ${input.businessContext}; keep the environment, light, and architecture as the subject.`
  );
}
