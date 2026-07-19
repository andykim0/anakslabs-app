export const editorMockupStyles = {
  blockLibrary: 'dbe-blockLibrary',
  blueChip: 'dbe-blueChip',
  canvas: 'dbe-canvas',
  canvasBody: 'dbe-canvasBody',
  canvasEyebrow: 'dbe-canvasEyebrow',
  canvasToolbar: 'dbe-canvasToolbar',
  contentGrid: 'dbe-contentGrid',
  copyLines: 'dbe-copyLines',
  cursor: 'dbe-cursor',
  demo: 'dbe-demo',
  dragGhost: 'dbe-dragGhost',
  goldChip: 'dbe-goldChip',
  heroSection: 'dbe-heroSection',
  heroToolbarLabel: 'dbe-heroToolbarLabel',
  imageBlock: 'dbe-imageBlock',
  imageGlyph: 'dbe-imageGlyph',
  imageHill: 'dbe-imageHill',
  imageSlot: 'dbe-imageSlot',
  imageSource: 'dbe-imageSource',
  imageSun: 'dbe-imageSun',
  menuSection: 'dbe-menuSection',
  menuToolbarLabel: 'dbe-menuToolbarLabel',
  mintChip: 'dbe-mintChip',
  palette: 'dbe-palette',
  paletteChip: 'dbe-paletteChip',
  paletteLabel: 'dbe-paletteLabel',
  railLabel: 'dbe-railLabel',
  savedStatus: 'dbe-savedStatus',
  sectionDot: 'dbe-sectionDot',
  sectionItem: 'dbe-sectionItem',
  sectionList: 'dbe-sectionList',
  sectionRail: 'dbe-sectionRail',
  toolbarStatus: 'dbe-toolbarStatus',
  typingCaret: 'dbe-typingCaret',
  typingLine: 'dbe-typingLine',
  typingText: 'dbe-typingText',
  workspace: 'dbe-workspace',
} as const;

export const EDITOR_MOCKUP_CSS = String.raw`
.dbe-demo {
  --demo-blue: #174dda;
  --demo-mint: #03a995;
  container-name: editor-demo;
  container-type: inline-size;
  width: 100%;
  color: #0b1736;
}

.dbe-workspace {
  position: relative;
  display: grid;
  grid-template-columns: minmax(84px, 0.26fr) minmax(0, 1fr);
  min-height: clamp(230px, 36vw, 288px);
  overflow: hidden;
  border: 1px solid #dce4f0;
  border-radius: 14px;
  background: #f8fbff;
  box-shadow: 0 18px 50px rgb(31 61 113 / 8%);
  isolation: isolate;
}

.dbe-sectionRail {
  position: relative;
  z-index: 2;
  padding: clamp(10px, 2.2cqw, 16px);
  border-right: 1px solid #dce4f0;
  background: #fff;
}

.dbe-railLabel,
.dbe-paletteLabel {
  display: block;
  color: #8791a4;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.dbe-sectionList {
  display: grid;
  gap: 5px;
  margin: 9px 0 0;
  padding: 0;
  list-style: none;
}

.dbe-sectionItem {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 5px 7px;
  border: 1px solid transparent;
  border-radius: 7px;
  color: #667085;
  background: transparent;
  font-size: 11px;
  font-weight: 650;
}

.dbe-sectionDot {
  width: 5px;
  height: 5px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: #c8d1de;
}

.dbe-menuSection {
  border-color: color-mix(in srgb, var(--demo-mint) 20%, white);
  color: #077c70;
  background: color-mix(in srgb, var(--demo-mint) 10%, white);
}

.dbe-menuSection .dbe-sectionDot {
  background: var(--demo-mint);
}

.dbe-blockLibrary {
  position: absolute;
  right: clamp(8px, 1.8cqw, 13px);
  bottom: clamp(10px, 2.2cqw, 16px);
  left: clamp(8px, 1.8cqw, 13px);
  padding-top: 9px;
  border-top: 1px solid #e7ecf3;
}

.dbe-imageSource,
.dbe-dragGhost {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #cfd9e8;
  border-radius: 8px;
  color: #41516c;
  background: #f8fbff;
  font-size: 10px;
  font-weight: 700;
}

.dbe-imageSource {
  position: relative;
  min-height: 29px;
  margin-top: 6px;
  padding: 5px 7px;
}

.dbe-imageGlyph {
  position: relative;
  width: 13px;
  height: 11px;
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid currentcolor;
  border-radius: 3px;
}

.dbe-imageGlyph::before {
  position: absolute;
  right: 1px;
  bottom: 1px;
  left: 1px;
  height: 5px;
  background: currentcolor;
  clip-path: polygon(0 100%, 33% 30%, 55% 72%, 74% 43%, 100% 100%);
  content: '';
}

.dbe-canvas {
  position: relative;
  min-width: 0;
  margin: clamp(8px, 1.8cqw, 14px);
  overflow: hidden;
  border: 1px solid #dce4f0;
  border-radius: 11px;
  background: #fff;
  box-shadow: 0 10px 28px rgb(31 61 113 / 7%);
}

.dbe-canvasToolbar {
  display: flex;
  min-height: 31px;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  border-bottom: 1px solid #edf1f6;
  color: #53617a;
  font-size: 9px;
  font-weight: 700;
}

.dbe-toolbarStatus {
  position: relative;
  display: block;
  width: 52px;
  height: 14px;
}

.dbe-heroToolbarLabel,
.dbe-menuToolbarLabel {
  position: absolute;
  inset: 0 auto auto 0;
}

.dbe-heroToolbarLabel {
  opacity: 0;
}

.dbe-savedStatus {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #708098;
}

.dbe-savedStatus::before {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--demo-mint);
  content: '';
}

.dbe-canvasBody {
  position: relative;
  min-height: clamp(152px, 27vw, 211px);
  padding: clamp(14px, 3.1cqw, 23px);
  background:
    radial-gradient(circle at 88% 18%, color-mix(in srgb, var(--demo-mint) 12%, transparent), transparent 28%),
    #fff;
}

.dbe-canvasEyebrow {
  margin: 0;
  color: var(--demo-mint);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.dbe-typingLine {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  margin-top: 5px;
}

.dbe-typingText {
  display: inline-block;
  overflow: hidden;
  color: #0b1736;
  font-size: clamp(14px, 3.4cqw, 21px);
  font-weight: 750;
  letter-spacing: -0.035em;
  line-height: 1.2;
  white-space: nowrap;
}

.dbe-typingCaret {
  width: 1px;
  height: 1.15em;
  margin-left: 2px;
  opacity: 0;
  background: var(--demo-mint);
}

.dbe-contentGrid {
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(72px, 1.08fr);
  align-items: end;
  gap: clamp(8px, 2cqw, 15px);
  margin-top: clamp(12px, 2.7cqw, 20px);
}

.dbe-copyLines {
  display: grid;
  gap: 7px;
  align-self: center;
}

.dbe-copyLines span {
  height: 5px;
  border-radius: 999px;
  background: #e9eef5;
}

.dbe-copyLines span:nth-child(2) {
  width: 88%;
}

.dbe-copyLines span:nth-child(3) {
  width: 64%;
}

.dbe-imageSlot {
  position: relative;
  min-width: 0;
  margin: 0;
  padding: 5px;
  border: 1px dashed color-mix(in srgb, var(--demo-mint) 42%, #dce4f0);
  border-radius: 9px;
  background: color-mix(in srgb, var(--demo-mint) 4%, white);
}

.dbe-imageBlock {
  position: relative;
  aspect-ratio: 16 / 8;
  overflow: hidden;
  border-radius: 6px;
  background: linear-gradient(145deg, color-mix(in srgb, var(--demo-mint) 18%, white), #eff8f6);
}

.dbe-imageSun {
  position: absolute;
  top: 17%;
  right: 18%;
  width: 13%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: color-mix(in srgb, var(--demo-mint) 55%, white);
}

.dbe-imageHill {
  position: absolute;
  right: -5%;
  bottom: -25%;
  left: -5%;
  height: 75%;
  border-radius: 50% 50% 0 0;
  background: linear-gradient(125deg, color-mix(in srgb, var(--demo-mint) 56%, #173967), var(--demo-mint));
}

.dbe-imageSlot figcaption {
  margin-top: 4px;
  color: #7b879a;
  font-size: 8px;
  font-weight: 650;
  line-height: 1.2;
}

.dbe-palette {
  position: absolute;
  right: clamp(8px, 1.8cqw, 13px);
  bottom: clamp(7px, 1.4cqw, 10px);
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 7px;
  border: 1px solid #e0e6ef;
  border-radius: 8px;
  background: rgb(255 255 255 / 92%);
  box-shadow: 0 5px 16px rgb(31 61 113 / 9%);
  backdrop-filter: blur(6px);
}

.dbe-palette ul {
  display: flex;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dbe-paletteChip {
  position: relative;
  display: block;
  width: 13px;
  height: 13px;
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 0 1px #d3dae5;
}

.dbe-menuSection::after,
.dbe-imageSource::after,
.dbe-mintChip::after {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 28px;
  height: 28px;
  border: 1.5px solid currentcolor;
  border-radius: 50%;
  opacity: 0;
  content: '';
  pointer-events: none;
  transform: translate3d(-50%, -50%, 0) scale(0.2);
}

.dbe-mintChip::after {
  color: var(--demo-mint);
}

.dbe-blueChip {
  background: var(--demo-blue);
}

.dbe-mintChip {
  background: var(--demo-mint);
  box-shadow: 0 0 0 2px #fff, 0 0 0 3px var(--demo-mint);
}

.dbe-goldChip {
  background: #b88b39;
}

.dbe-dragGhost {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 8;
  min-height: 31px;
  padding: 6px 9px;
  opacity: 0;
  border-color: var(--demo-blue);
  color: #1748bf;
  background: rgb(248 251 255 / 94%);
  box-shadow: 0 10px 24px rgb(23 77 218 / 18%);
  pointer-events: none;
}

.dbe-cursor {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10;
  width: 17px;
  height: 17px;
  opacity: 0;
  color: #0b1736;
  filter: drop-shadow(0 2px 2px rgb(255 255 255 / 80%));
  pointer-events: none;
}

/* The base DOM is the complete final state. Animation is progressive enhancement only. */
.dbe-demo[data-enhanced='true'] .dbe-cursor {
  animation: editor-cursor var(--editor-demo-duration) cubic-bezier(0.16, 1, 0.3, 1) infinite paused;
}

.dbe-demo[data-enhanced='true'] .dbe-heroSection {
  animation: editor-hero-selection var(--editor-demo-duration) linear infinite paused;
}

.dbe-demo[data-enhanced='true'] .dbe-menuSection {
  animation: editor-menu-selection var(--editor-demo-duration) linear infinite paused;
}

.dbe-demo[data-enhanced='true'] .dbe-menuSection::after {
  animation: editor-menu-ripple var(--editor-demo-duration) linear infinite paused;
}

.dbe-demo[data-enhanced='true'] .dbe-heroSection .dbe-sectionDot {
  animation: editor-hero-dot var(--editor-demo-duration) linear infinite paused;
}

.dbe-demo[data-enhanced='true'] .dbe-menuSection .dbe-sectionDot {
  animation: editor-menu-dot var(--editor-demo-duration) linear infinite paused;
}

.dbe-demo[data-enhanced='true'] .dbe-heroToolbarLabel {
  animation: editor-hero-label var(--editor-demo-duration) linear infinite paused;
}

.dbe-demo[data-enhanced='true'] .dbe-menuToolbarLabel {
  animation: editor-menu-label var(--editor-demo-duration) linear infinite paused;
}

.dbe-demo[data-enhanced='true'] .dbe-imageSource {
  animation: editor-source-pickup var(--editor-demo-duration) linear infinite paused;
}

.dbe-demo[data-enhanced='true'] .dbe-imageSource::after {
  animation: editor-source-ripple var(--editor-demo-duration) linear infinite paused;
}

.dbe-demo[data-enhanced='true'] .dbe-dragGhost {
  animation: editor-block-drag var(--editor-demo-duration) cubic-bezier(0.22, 0.72, 0.26, 1) infinite paused;
}

.dbe-demo[data-enhanced='true'] .dbe-imageSlot {
  animation:
    editor-image-drop var(--editor-demo-duration) cubic-bezier(0.22, 0.72, 0.26, 1) infinite paused,
    editor-slot-accent var(--editor-demo-duration) linear infinite paused;
}

.dbe-demo[data-enhanced='true'] .dbe-typingText {
  animation: editor-type-copy var(--editor-demo-duration) steps(10, end) infinite paused;
}

.dbe-demo[data-enhanced='true'] .dbe-typingCaret {
  animation: editor-type-caret var(--editor-demo-duration) steps(1, end) infinite paused;
}

.dbe-demo[data-enhanced='true'] .dbe-canvasBody {
  animation: editor-canvas-accent var(--editor-demo-duration) linear infinite paused;
}

.dbe-demo[data-enhanced='true'] .dbe-imageBlock {
  animation: editor-image-accent var(--editor-demo-duration) linear infinite paused;
}

.dbe-demo[data-enhanced='true'] .dbe-imageSun {
  animation: editor-image-sun-accent var(--editor-demo-duration) linear infinite paused;
}

.dbe-demo[data-enhanced='true'] .dbe-imageHill {
  animation: editor-image-hill-accent var(--editor-demo-duration) linear infinite paused;
}

.dbe-demo[data-enhanced='true'] .dbe-canvasEyebrow,
.dbe-demo[data-enhanced='true'] .dbe-savedStatus::before {
  animation-name: editor-accent-shift;
  animation-duration: var(--editor-demo-duration);
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  animation-play-state: paused;
}

.dbe-demo[data-enhanced='true'] .dbe-blueChip {
  animation: editor-blue-chip var(--editor-demo-duration) linear infinite paused;
}

.dbe-demo[data-enhanced='true'] .dbe-mintChip {
  animation: editor-mint-chip var(--editor-demo-duration) linear infinite paused;
}

.dbe-demo[data-enhanced='true'] .dbe-mintChip::after {
  animation: editor-mint-ripple var(--editor-demo-duration) linear infinite paused;
}

.dbe-demo[data-playing='true'] .dbe-cursor,
.dbe-demo[data-playing='true'] .dbe-heroSection,
.dbe-demo[data-playing='true'] .dbe-menuSection,
.dbe-demo[data-playing='true'] .dbe-menuSection::after,
.dbe-demo[data-playing='true'] .dbe-heroSection .dbe-sectionDot,
.dbe-demo[data-playing='true'] .dbe-menuSection .dbe-sectionDot,
.dbe-demo[data-playing='true'] .dbe-heroToolbarLabel,
.dbe-demo[data-playing='true'] .dbe-menuToolbarLabel,
.dbe-demo[data-playing='true'] .dbe-imageSource,
.dbe-demo[data-playing='true'] .dbe-imageSource::after,
.dbe-demo[data-playing='true'] .dbe-dragGhost,
.dbe-demo[data-playing='true'] .dbe-imageSlot,
.dbe-demo[data-playing='true'] .dbe-typingText,
.dbe-demo[data-playing='true'] .dbe-typingCaret,
.dbe-demo[data-playing='true'] .dbe-canvasBody,
.dbe-demo[data-playing='true'] .dbe-canvasEyebrow,
.dbe-demo[data-playing='true'] .dbe-savedStatus::before,
.dbe-demo[data-playing='true'] .dbe-imageBlock,
.dbe-demo[data-playing='true'] .dbe-imageSun,
.dbe-demo[data-playing='true'] .dbe-imageHill,
.dbe-demo[data-playing='true'] .dbe-blueChip,
.dbe-demo[data-playing='true'] .dbe-mintChip {
  animation-play-state: running;
}

.dbe-demo[data-playing='true'] .dbe-mintChip::after {
  animation-play-state: running;
}

@keyframes editor-cursor {
  0%, 4% { transform: translate3d(12cqw, 45px, 0); opacity: 0; }
  4.01%, 7% { transform: translate3d(12cqw, 45px, 0); opacity: 1; }
  7% { animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }
  14% { transform: translate3d(12cqw, 100px, 0) scale(1); opacity: 1; }
  14.8% { transform: translate3d(12cqw, 100px, 0) scale(0.86); opacity: 1; }
  16%, 21% { transform: translate3d(12cqw, 100px, 0) scale(1); opacity: 1; }
  21% { animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }
  29% { transform: translate3d(13cqw, 214px, 0) scale(1); opacity: 1; }
  29.8% { transform: translate3d(13cqw, 214px, 0) scale(0.86); opacity: 1; }
  31%, 36% { transform: translate3d(13cqw, 214px, 0) scale(1); opacity: 1; }
  36% { animation-timing-function: cubic-bezier(0.22, 0.6, 0.36, 0.85); }
  39.5% { transform: translate3d(29cqw, 222px, 0) scale(1); opacity: 1; animation-timing-function: cubic-bezier(0.22, 0.6, 0.36, 0.85); }
  43% { transform: translate3d(51cqw, 171px, 0) scale(1); opacity: 1; animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }
  46%, 51% { transform: translate3d(70cqw, 148px, 0) scale(1); opacity: 1; }
  51% { animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }
  59% { transform: translate3d(40cqw, 80px, 0) scale(1); opacity: 1; }
  59.8% { transform: translate3d(40cqw, 80px, 0) scale(0.86); opacity: 1; }
  61%, 67% { transform: translate3d(40cqw, 80px, 0) scale(1); opacity: 1; }
  67% { animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }
  75% { transform: translate3d(84cqw, 248px, 0) scale(1); opacity: 1; }
  75.8% { transform: translate3d(84cqw, 248px, 0) scale(0.86); opacity: 1; }
  77%, 92% { transform: translate3d(84cqw, 248px, 0) scale(1); opacity: 1; }
  92% { animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }
  97%, 100% { transform: translate3d(12cqw, 45px, 0) scale(1); opacity: 0; }
}

@keyframes editor-hero-selection {
  0%, 13.99% { color: #1748bf; border-color: #cbd9fb; background: #eef3ff; }
  16%, 92% { color: #667085; border-color: transparent; background: transparent; }
  97%,
  100% { color: #1748bf; border-color: #cbd9fb; background: #eef3ff; }
}

@keyframes editor-menu-selection {
  0%, 13.99% { color: #667085; border-color: transparent; background: transparent; transform: scale(1); }
  14.8% { color: #1748bf; border-color: #cbd9fb; background: #eef3ff; transform: scale(0.97); }
  16%, 73% { color: #1748bf; border-color: #cbd9fb; background: #eef3ff; transform: scale(1); }
  77%, 92% { color: #077c70; border-color: #c8ebe6; background: #eefaf8; transform: scale(1); }
  97%,
  100% { color: #667085; border-color: transparent; background: transparent; }
}

@keyframes editor-menu-ripple {
  0%, 14% { transform: translate3d(-50%, -50%, 0) scale(0.2); opacity: 0; }
  14.5% { transform: translate3d(-50%, -50%, 0) scale(0.3); opacity: 0.42; }
  19.5%, 100% { transform: translate3d(-50%, -50%, 0) scale(1.7); opacity: 0; }
}

@keyframes editor-hero-dot {
  0%, 13.99% { background-color: #174dda; }
  16%, 92% { background-color: #c8d1de; }
  97%, 100% { background-color: #174dda; }
}

@keyframes editor-menu-dot {
  0%, 13.99% { background-color: #c8d1de; }
  16%, 73% { background-color: #174dda; }
  77%, 92% { background-color: #03a995; }
  97%,
  100% { background-color: #c8d1de; }
}

@keyframes editor-hero-label {
  0%, 13.99% { opacity: 1; transform: translate3d(0, 0, 0); }
  16%, 92% { opacity: 0; transform: translate3d(0, -4px, 0); }
  97%,
  100% { opacity: 1; transform: translate3d(0, 0, 0); }
}

@keyframes editor-menu-label {
  0%, 13.99% { opacity: 0; transform: translate3d(0, 4px, 0); }
  16%, 92% { opacity: 1; transform: translate3d(0, 0, 0); }
  97%,
  100% { opacity: 0; transform: translate3d(0, 4px, 0); }
}

@keyframes editor-source-pickup {
  0%, 28.99% { border-color: #cfd9e8; color: #41516c; background: #f8fbff; transform: scale(1); }
  29.8% { border-color: #174dda; color: #1748bf; background: #eef3ff; transform: scale(0.97); }
  31%, 36% { border-color: #174dda; color: #1748bf; background: #eef3ff; transform: scale(1); }
  39.5%, 100% { border-color: #cfd9e8; color: #41516c; background: #f8fbff; transform: scale(1); }
}

@keyframes editor-source-ripple {
  0%, 29% { transform: translate3d(-50%, -50%, 0) scale(0.2); opacity: 0; }
  29.5% { transform: translate3d(-50%, -50%, 0) scale(0.3); opacity: 0.42; }
  35.5%, 100% { transform: translate3d(-50%, -50%, 0) scale(1.7); opacity: 0; }
}

@keyframes editor-block-drag {
  0%, 31% { transform: translate3d(10cqw, 208px, 0) scale(0.96); opacity: 0; }
  32%, 36% { transform: translate3d(10cqw, 208px, 0) scale(1); opacity: 1; }
  39.5% { transform: translate3d(25cqw, 216px, 0) rotate(-0.6deg) scale(1); opacity: 1; }
  43% { transform: translate3d(45cqw, 165px, 0) rotate(0.35deg) scale(1); opacity: 1; }
  46% { transform: translate3d(63cqw, 140px, 0) rotate(0deg) scale(1); opacity: 1; }
  47%, 100% { transform: translate3d(63cqw, 140px, 0) rotate(0deg) scale(0.97); opacity: 0; }
}

@keyframes editor-image-drop {
  0%, 43% { transform: scale(0.985); opacity: 0.3; }
  46%, 92% { transform: scale(1); opacity: 1; }
  97%,
  100% { transform: scale(0.985); opacity: 0.3; }
}

@keyframes editor-slot-accent {
  0%, 74.99% { border-color: #b8caf8; background-color: #f7f9ff; }
  77%, 92% { border-color: #a7ded6; background-color: #f5fbfa; }
  97%,
  100% { border-color: #b8caf8; background-color: #f7f9ff; }
}

@keyframes editor-type-copy {
  0%, 59% { clip-path: inset(0 100% 0 0); }
  67%, 92% { clip-path: inset(0 0 0 0); }
  97%,
  100% { clip-path: inset(0 100% 0 0); }
}

@keyframes editor-type-caret {
  0%, 59% { opacity: 0; }
  59.5%, 61.5%, 63.5%, 65.5% { opacity: 1; }
  60.5%, 62.5%, 64.5%, 66.5% { opacity: 0; }
  67%, 100% { opacity: 0; }
}

@keyframes editor-canvas-accent {
  0%, 74.99% {
    background: radial-gradient(circle at 88% 18%, rgb(23 77 218 / 12%), transparent 28%), #fff;
  }
  77%, 92% {
    background: radial-gradient(circle at 88% 18%, rgb(3 169 149 / 12%), transparent 28%), #fff;
  }
  97%, 100% {
    background: radial-gradient(circle at 88% 18%, rgb(23 77 218 / 12%), transparent 28%), #fff;
  }
}

@keyframes editor-image-accent {
  0%, 74.99% { background: linear-gradient(145deg, #e5ecff, #f1f5ff); }
  77%, 92% { background: linear-gradient(145deg, #d9f2ee, #eff8f6); }
  97%,
  100% { background: linear-gradient(145deg, #e5ecff, #f1f5ff); }
}

@keyframes editor-image-sun-accent {
  0%, 74.99% { background-color: #829ff1; }
  77%, 92% { background-color: #73cfc3; }
  97%,
  100% { background-color: #829ff1; }
}

@keyframes editor-image-hill-accent {
  0%, 74.99% { background: linear-gradient(125deg, #173967, #174dda); }
  77%, 92% { background: linear-gradient(125deg, #173967, #03a995); }
  97%,
  100% { background: linear-gradient(125deg, #173967, #174dda); }
}

@keyframes editor-accent-shift {
  0%, 74.99% { color: #174dda; border-color: #b8caf8; background-color: #eef3ff; }
  77%, 92% { color: #03a995; border-color: #a7ded6; background-color: #effaf8; }
  97%,
  100% { color: #174dda; border-color: #b8caf8; background-color: #eef3ff; }
}

@keyframes editor-blue-chip {
  0%, 74.99% { transform: scale(1.08); box-shadow: 0 0 0 2px #fff, 0 0 0 3px #174dda; }
  77%, 92% { transform: scale(1); box-shadow: 0 0 0 1px #d3dae5; }
  97%,
  100% { transform: scale(1.08); box-shadow: 0 0 0 2px #fff, 0 0 0 3px #174dda; }
}

@keyframes editor-mint-chip {
  0%, 74.99% { transform: scale(1); box-shadow: 0 0 0 1px #d3dae5; }
  75.8% { transform: scale(0.88); box-shadow: 0 0 0 2px #fff, 0 0 0 3px #03a995; }
  77%, 92% { transform: scale(1.08); box-shadow: 0 0 0 2px #fff, 0 0 0 3px #03a995; }
  97%,
  100% { transform: scale(1); box-shadow: 0 0 0 1px #d3dae5; }
}

@keyframes editor-mint-ripple {
  0%, 75% { transform: translate3d(-50%, -50%, 0) scale(0.2); opacity: 0; }
  75.5% { transform: translate3d(-50%, -50%, 0) scale(0.3); opacity: 0.48; }
  81.5%, 100% { transform: translate3d(-50%, -50%, 0) scale(1.9); opacity: 0; }
}

@container editor-demo (max-width: 420px) {
  .dbe-workspace {
    grid-template-columns: 82px minmax(0, 1fr);
    min-height: 232px;
  }

  .dbe-sectionRail {
    padding: 9px 7px;
  }

  .dbe-sectionItem {
    gap: 4px;
    min-height: 25px;
    padding: 4px 5px;
    font-size: 9px;
  }

  .dbe-blockLibrary {
    right: 7px;
    bottom: 9px;
    left: 7px;
  }

  .dbe-canvas {
    margin: 7px;
  }

  .dbe-canvasBody {
    min-height: 175px;
    padding: 12px 10px;
  }

  .dbe-contentGrid {
    grid-template-columns: 0.78fr 1.22fr;
  }

  .dbe-paletteLabel,
  .dbe-imageSlot figcaption {
    display: none;
  }

  .dbe-palette {
    gap: 4px;
    padding: 5px;
  }

  @keyframes editor-cursor {
    0%, 4% { transform: translate3d(12cqw, 38px, 0); opacity: 0; }
    4.01%, 7% { transform: translate3d(12cqw, 38px, 0); opacity: 1; }
    7% { animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }
    14% { transform: translate3d(12cqw, 88px, 0) scale(1); opacity: 1; }
    14.8% { transform: translate3d(12cqw, 88px, 0) scale(0.86); opacity: 1; }
    16%, 21% { transform: translate3d(12cqw, 88px, 0) scale(1); opacity: 1; }
    21% { animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }
    29% { transform: translate3d(13cqw, 190px, 0) scale(1); opacity: 1; }
    29.8% { transform: translate3d(13cqw, 190px, 0) scale(0.86); opacity: 1; }
    31%, 36% { transform: translate3d(13cqw, 190px, 0) scale(1); opacity: 1; }
    36% { animation-timing-function: cubic-bezier(0.22, 0.6, 0.36, 0.85); }
    39.5% { transform: translate3d(29cqw, 195px, 0) scale(1); opacity: 1; animation-timing-function: cubic-bezier(0.22, 0.6, 0.36, 0.85); }
    43% { transform: translate3d(50cqw, 157px, 0) scale(1); opacity: 1; animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }
    46%, 51% { transform: translate3d(70cqw, 137px, 0) scale(1); opacity: 1; }
    51% { animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }
    59% { transform: translate3d(48cqw, 73px, 0) scale(1); opacity: 1; }
    59.8% { transform: translate3d(48cqw, 73px, 0) scale(0.86); opacity: 1; }
    61%, 67% { transform: translate3d(48cqw, 73px, 0) scale(1); opacity: 1; }
    67% { animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }
    75% { transform: translate3d(82cqw, 210px, 0) scale(1); opacity: 1; }
    75.8% { transform: translate3d(82cqw, 210px, 0) scale(0.86); opacity: 1; }
    77%, 92% { transform: translate3d(82cqw, 210px, 0) scale(1); opacity: 1; }
    92% { animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }
    97%, 100% { transform: translate3d(12cqw, 38px, 0) scale(1); opacity: 0; }
  }

  @keyframes editor-block-drag {
    0%, 31% { transform: translate3d(7cqw, 184px, 0) scale(0.96); opacity: 0; }
    32%, 36% { transform: translate3d(7cqw, 184px, 0) scale(1); opacity: 1; }
    39.5% { transform: translate3d(23cqw, 190px, 0) rotate(-0.6deg) scale(0.98); opacity: 1; }
    43% { transform: translate3d(43cqw, 151px, 0) rotate(0.35deg) scale(0.93); opacity: 1; }
    46% { transform: translate3d(59cqw, 131px, 0) rotate(0deg) scale(0.88); opacity: 1; }
    47%, 100% { transform: translate3d(59cqw, 131px, 0) rotate(0deg) scale(0.88); opacity: 0; }
  }
}

@media (prefers-reduced-motion: reduce) {
  .dbe-demo *,
  .dbe-demo *::before,
  .dbe-demo *::after {
    animation: none !important;
    transition: none !important;
  }

  .dbe-cursor,
  .dbe-dragGhost,
  .dbe-heroToolbarLabel {
    display: none;
  }
}
`;
