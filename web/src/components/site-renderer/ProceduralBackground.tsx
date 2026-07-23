import type { CSSProperties, ReactNode } from 'react';
import { generateAbsBackground } from '@/lib/abstract/generator';
import type { ProceduralBackgroundSpec } from '@/lib/abstract/types';
import type { SignatureBreakpointBand } from '@/lib/motion/signature-contract';
import type { SiteTheme } from '@/lib/types/site';

const ABS_RESPONSIVE_CSS = `
[data-abs-responsive]>[data-abs-band]{display:none}
[data-abs-responsive]>[data-abs-band="wide"]{display:block}
@media(max-width:1279.98px){
  [data-abs-responsive]>[data-abs-band="wide"]{display:none}
  [data-abs-responsive]>[data-abs-band="compact"]{display:block}
}
@media(max-width:767.98px){
  [data-abs-responsive]>[data-abs-band="compact"]{display:none}
  [data-abs-responsive]>[data-abs-band="mobile"]{display:block}
}
`;

interface ProceduralBackgroundProps {
  spec: ProceduralBackgroundSpec;
  theme: SiteTheme;
  band: SignatureBreakpointBand | 'responsive';
}

function zoneFrame(zone: { x: number; y: number; width: number; height: number }) {
  return {
    x: Number((zone.x * 1000).toFixed(3)),
    y: Number((zone.y * 1000).toFixed(3)),
    width: Number((zone.width * 1000).toFixed(3)),
    height: Number((zone.height * 1000).toFixed(3)),
  };
}

function pathNodes(
  paths: ReturnType<typeof generateAbsBackground>['lowFrequencyPaths'],
  prefix: string,
): ReactNode {
  return paths.map((path, index) => (
    <path
      key={`${prefix}-${index}`}
      d={path.d}
      fill={path.fill}
      stroke={path.stroke}
      strokeWidth={path.strokeWidth}
      strokeLinecap={path.strokeLinecap}
      strokeLinejoin={path.strokeLinejoin}
      strokeDasharray={path.dashArray}
      opacity={path.opacity}
    />
  ));
}

function BackgroundBand({
  spec,
  theme,
  band,
}: Omit<ProceduralBackgroundProps, 'band'> & { band: SignatureBreakpointBand }) {
  const projection = generateAbsBackground({ spec, theme, band });
  const style: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    pointerEvents: 'none',
    backgroundColor: projection.baseColor,
    backgroundImage: projection.backgroundImage,
  };
  if (projection.mode === 'solid') {
    return (
      <div
        aria-hidden="true"
        data-abs-band={band}
        data-abs-family={projection.familyId}
        data-abs-mode="solid"
        style={style}
      />
    );
  }

  const definitionId = projection.definitionId;
  const guarded = zoneFrame(projection.guardedQuietZone);
  const quiet = zoneFrame(projection.quietZone);
  const detailMaskId = `${definitionId}-detail-mask`;
  const quietBlurId = `${definitionId}-quiet-blur`;
  const noiseId = `${definitionId}-noise`;
  const patternId = `${definitionId}-pattern`;
  const scrimBoost = projection.scrim === 'subtle-scrim' ? 0.06 : 0;

  return (
    <div
      aria-hidden="true"
      data-abs-band={band}
      data-abs-family={projection.familyId}
      data-abs-mode="authored"
      data-abs-safe-zone={spec.bands[band].textSafeZoneId}
      style={style}
    >
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid slice"
        width="100%"
        height="100%"
        style={{ position: 'absolute', inset: 0 }}
      >
        <defs>
          <mask id={detailMaskId} maskUnits="userSpaceOnUse">
            <rect width="1000" height="1000" fill="white" />
            <rect
              x={guarded.x}
              y={guarded.y}
              width={guarded.width}
              height={guarded.height}
              fill="black"
            />
          </mask>
          <filter id={quietBlurId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="54" />
          </filter>
          {projection.noise ? (
            <filter id={noiseId} x="0" y="0" width="100%" height="100%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency={projection.noise.baseFrequency}
                numOctaves={projection.noise.octaves}
                seed={projection.noise.seed}
                stitchTiles="stitch"
              />
              <feColorMatrix type="saturate" values="0" />
            </filter>
          ) : null}
          {projection.pattern ? (
            <pattern
              id={patternId}
              width={projection.pattern.width}
              height={projection.pattern.height}
              patternUnits="userSpaceOnUse"
              patternTransform={`rotate(${projection.pattern.rotation})`}
            >
              {pathNodes(projection.pattern.paths, `${definitionId}-pattern`)}
            </pattern>
          ) : null}
        </defs>
        <g data-abs-low-frequency>
          {pathNodes(projection.lowFrequencyPaths, `${definitionId}-low`)}
        </g>
        <g data-abs-high-frequency mask={`url(#${detailMaskId})`}>
          {pathNodes(projection.highFrequencyPaths, `${definitionId}-high`)}
          {projection.noise ? (
            <rect
              width="1000"
              height="1000"
              fill={theme.tokens?.color.border ?? theme.palette.muted}
              opacity={projection.noise.opacity}
              filter={`url(#${noiseId})`}
            />
          ) : null}
          {projection.pattern ? (
            <rect
              width="1000"
              height="1000"
              fill={`url(#${patternId})`}
              opacity={projection.pattern.opacity}
            />
          ) : null}
        </g>
        <rect
          data-abs-quiet-wash
          x={quiet.x}
          y={quiet.y}
          width={quiet.width}
          height={quiet.height}
          fill={projection.quietWashColor}
          opacity={Math.min(1, projection.quietWashOpacity + scrimBoost)}
          filter={`url(#${quietBlurId})`}
        />
      </svg>
    </div>
  );
}

/** Static-complete atmospheric art. JavaScript never measures or advances this layer. */
export function ProceduralBackground(props: ProceduralBackgroundProps) {
  if (props.band !== 'responsive') return <BackgroundBand {...props} band={props.band} />;
  return (
    <div
      aria-hidden="true"
      data-abs-responsive
      data-abs-slot={props.spec.slotId}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      <style dangerouslySetInnerHTML={{ __html: ABS_RESPONSIVE_CSS }} />
      <BackgroundBand {...props} band="wide" />
      <BackgroundBand {...props} band="compact" />
      <BackgroundBand {...props} band="mobile" />
    </div>
  );
}
