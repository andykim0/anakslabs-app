/**
 * Reading structure derived from a stored article document.
 *
 * Nothing here writes, rewrites, reorders or invents a single character. Every function is a pure
 * read over `document.blocks` that answers one question — "which of these blocks are a question
 * set?", "which sentence carries the section?" — and returns indices into the array the generator
 * produced. That constraint is not stylistic: `public-integrity.ts` re-hashes the stored document
 * on every public read (`contentSha256(generated) !== evidence.validatedDocumentSha256` unpublishes
 * the post), so a renderer that edited the document would take the article off the customer's site.
 *
 * The template consumes these indices to decide presentation only. The same text renders either
 * way; what changes is which box it renders inside.
 */
import type { ContentPostDocument } from './contracts';

type Block = ContentPostDocument['blocks'][number];

/** One question and the answer that already follows it in the document. */
export interface ArticleKeyFact {
  question: string;
  answer: string;
  /** Index of the heading block this pair started at, for de-duplicating the body render. */
  headingIndex: number;
  answerIndex: number;
}

export interface ArticleKeyFacts {
  /** The level-2 heading immediately above the run, when there is one. */
  title: string | null;
  titleIndex: number | null;
  facts: readonly ArticleKeyFact[];
  /** Every block index the box consumes, so the body skips them instead of printing twice. */
  consumed: ReadonlySet<number>;
}

/**
 * Two pairs is the floor. One question followed by one paragraph is an ordinary section with an
 * interrogative heading — extremely common in this generator's output — and boxing it would turn
 * a normal subsection into a "Key facts" panel that answers nothing the body did not already say.
 */
const MIN_KEY_FACTS = 2;

/**
 * A question, by the only test that survives translation: the mark the writer put at the end.
 * Matching on interrogative words instead would fire on "How we prepare your treatment room",
 * which is a section title, not a question a reader asked.
 */
function isQuestionHeading(block: Block | undefined): block is Extract<Block, { type: 'heading' }> {
  return block?.type === 'heading' && block.level === 3 && block.text.trim().endsWith('?');
}

function isParagraph(block: Block | undefined): block is Extract<Block, { type: 'paragraph' }> {
  return block?.type === 'paragraph';
}

/**
 * The article's own question set, if it has one.
 *
 * The generator has no FAQ block type — `contracts.ts` allows heading, paragraph, list and table
 * and nothing else — so a question set reaches us as an ordinary run of `h3?` + paragraph. This
 * finds the longest such run, which is the same content a `FAQPage` block would have carried, and
 * hands it to the template and to the JSON-LD from one place, so the box a reader sees and the
 * markup an assistant quotes can never drift apart.
 */
export function articleKeyFacts(document: ContentPostDocument): ArticleKeyFacts | null {
  const blocks = document.blocks;
  let best: { start: number; facts: ArticleKeyFact[] } | null = null;

  for (let index = 0; index < blocks.length; index += 1) {
    if (!isQuestionHeading(blocks[index])) continue;
    const facts: ArticleKeyFact[] = [];
    let cursor = index;
    while (isQuestionHeading(blocks[cursor]) && isParagraph(blocks[cursor + 1])) {
      const heading = blocks[cursor] as Extract<Block, { type: 'heading' }>;
      const answer = blocks[cursor + 1] as Extract<Block, { type: 'paragraph' }>;
      facts.push({
        question: heading.text,
        answer: answer.text,
        headingIndex: cursor,
        answerIndex: cursor + 1,
      });
      cursor += 2;
    }
    if (facts.length > (best?.facts.length ?? 0)) best = { start: index, facts };
    // Skip past what this run consumed — but only past what it actually consumed. A question
    // heading followed by a list rather than a paragraph leaves `cursor` at `index`, and rewinding
    // to `index - 1` there would hand the same block back to the loop for ever. The generator can
    // and does emit exactly that shape, and the hang would be inside a tenant page render.
    index = Math.max(index, cursor - 1);
  }

  if (!best || best.facts.length < MIN_KEY_FACTS) return null;

  // A level-2 heading directly above the run names it ("Questions patients ask about sedation").
  // Absent one the box carries its own generic label rather than borrowing an unrelated heading.
  const above = blocks[best.start - 1];
  const titled = above?.type === 'heading' && above.level === 2;
  const consumed = new Set<number>();
  if (titled) consumed.add(best.start - 1);
  for (const fact of best.facts) {
    consumed.add(fact.headingIndex);
    consumed.add(fact.answerIndex);
  }

  return {
    title: titled ? (above as Extract<Block, { type: 'heading' }>).text : null,
    titleIndex: titled ? best.start - 1 : null,
    facts: best.facts,
    consumed,
  };
}

/**
 * Bounds for the sentence the template sets large.
 *
 * Below the floor a fragment reads as a stray caption; above the ceiling the "quote" is a
 * paragraph in a bigger font and the device stops meaning anything.
 */
const HIGHLIGHT_MIN_LENGTH = 60;
const HIGHLIGHT_MAX_LENGTH = 190;
/** Under this, the article is too short to give one of its few paragraphs to display type. */
const HIGHLIGHT_MIN_BLOCKS = 6;
/** Where in the article a pulled sentence reads as a turn rather than a restated opening. */
const HIGHLIGHT_TARGET_POSITION = 0.4;

/** A single sentence: no terminator with more text after it. */
function isSingleSentence(text: string): boolean {
  return !/[.!?]["')\]]?\s+\S/u.test(text.trim());
}

/**
 * The one body sentence the template sets in display type.
 *
 * This is a *promotion*, not a pull quote in the magazine sense: the paragraph stays exactly where
 * the generator put it and is printed exactly once. A true pull quote repeats a sentence, and
 * repeating a clinical sentence is how a hedged statement ("options vary from person to person")
 * becomes a headline the practice did not write. Selection is deterministic — the same document
 * always promotes the same paragraph — because the live route and the static export render the
 * same article and must not disagree.
 *
 * Returns the block index, or null when nothing qualifies. Nothing qualifying is a normal outcome.
 */
export function articleHighlightIndex(
  document: ContentPostDocument,
  excluded: ReadonlySet<number> = new Set(),
): number | null {
  const blocks = document.blocks;
  if (blocks.length < HIGHLIGHT_MIN_BLOCKS) return null;

  const candidates: number[] = [];
  for (let index = 1; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (excluded.has(index) || block?.type !== 'paragraph') continue;
    const text = block.text.trim();
    if (text.length < HIGHLIGHT_MIN_LENGTH || text.length > HIGHLIGHT_MAX_LENGTH) continue;
    if (!isSingleSentence(text)) continue;
    candidates.push(index);
  }
  if (candidates.length === 0) return null;

  const target = (blocks.length - 1) * HIGHLIGHT_TARGET_POSITION;
  return candidates.reduce((best, index) =>
    Math.abs(index - target) < Math.abs(best - target) ? index : best);
}

/** Words per minute for adult reading of general-interest prose; rounded up to a whole minute. */
const WORDS_PER_MINUTE = 220;

/** Every reader-visible word in the stored document, counted once. */
export function articleWordCount(document: ContentPostDocument): number {
  let words = 0;
  const add = (text: string) => {
    const trimmed = text.trim();
    if (trimmed) words += trimmed.split(/\s+/u).length;
  };
  for (const block of document.blocks) {
    if (block.type === 'heading' || block.type === 'paragraph') add(block.text);
    else if (block.type === 'list') for (const item of block.items) add(typeof item === 'string' ? item : item.text);
    // A figure is read, so it is counted. Discriminated explicitly rather than left to the `else`
    // that used to mean "table": with a fifth block type that branch reached for `block.columns`
    // on a chart and threw inside a tenant page render.
    else if (block.type === 'chart') {
      add(block.title);
      if (block.caption) add(block.caption);
      for (const item of block.items) {
        add(item.label);
        if (item.note) add(item.note);
      }
    } else {
      if (block.caption) add(block.caption);
      for (const column of block.columns) add(column.header);
      for (const row of block.rows) for (const cell of row.cells) add(cell.text);
    }
  }
  return words;
}

export function articleReadingMinutes(document: ContentPostDocument): number {
  return Math.max(1, Math.ceil(articleWordCount(document) / WORDS_PER_MINUTE));
}

/**
 * The category chip.
 *
 * The schema has no category column, so the chip shows the post's first tag — a value the honesty
 * gate already screened as public text — or nothing. It never derives a category from the title,
 * because a guessed category on a medical article is a claim about what the article is about.
 */
export function articleCategory(tags: readonly string[]): string | null {
  return tags.find((tag) => tag.trim().length > 0)?.trim() ?? null;
}
