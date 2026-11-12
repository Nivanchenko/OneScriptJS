import { DiagnosticSeverity } from 'vscode-languageserver';
import type { Diagnostic, Position, Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenType } from '../lexer/token';
import type { Token } from '../lexer/token';
import { analyze, MAX_DIAGNOSTICS } from './analysis';
import type { Analysis } from './analysis';
import { findBlocks, HTML_LANGUAGE_ID } from './html-blocks';
import type { HtmlBlock } from './html-blocks';
import { encodeSemanticTokens, semanticTokenList, MAX_SEMANTIC_TOKEN_LINES } from './semantic-tokens';

export interface AnalyzeHtmlOptions {
  uri?: string;
  version?: number;
}

/** Блок HTML вместе с виртуальным документом и анализом 014. */
export interface EmbeddedBlock extends HtmlBlock {
  index: number;
  text: string;
  /** Виртуальный документ содержимого блока (локальные координаты). */
  document: TextDocument;
  analysis: Analysis;
  /** HTML-документ, в котором расположен блок. */
  html: TextDocument;
}

/** Результат анализа HTML-документа: блоки в порядке документа и их анализы. */
export interface EmbeddedAnalysis {
  uri: string;
  version: number;
  text: string;
  document: TextDocument;
  blocks: EmbeddedBlock[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function blockOffsetOf(block: EmbeddedBlock, position: Position): number {
  return clamp(block.html.offsetAt(position), block.contentStartOffset, block.contentEndOffset);
}

/** Локальный диапазон блока → диапазон HTML-документа (UTF-16, в границах блока). */
export function toDocumentRange(block: EmbeddedBlock, localRange: Range): Range {
  const start = clamp(
    block.contentStartOffset + block.document.offsetAt(localRange.start),
    block.contentStartOffset,
    block.contentEndOffset,
  );
  const end = clamp(
    block.contentStartOffset + block.document.offsetAt(localRange.end),
    start,
    block.contentEndOffset,
  );
  return { start: block.html.positionAt(start), end: block.html.positionAt(end) };
}

/** Позиция HTML-документа → локальная позиция виртуального документа блока. */
export function toBlockPosition(block: EmbeddedBlock, position: Position): Position {
  const offset = blockOffsetOf(block, position);
  return block.document.positionAt(offset - block.contentStartOffset);
}

/** Блок, содержимое которого содержит позицию HTML-документа (границы включительно). */
export function blockAt(analysis: EmbeddedAnalysis, position: Position): EmbeddedBlock | undefined {
  const offset = analysis.document.offsetAt(position);
  return analysis.blocks.find(
    (block) => offset >= block.contentStartOffset && offset <= block.contentEndOffset,
  );
}

/**
 * Анализ HTML-документа по блокам: каждый `<script type="text/osjs">` —
 * отдельный виртуальный документ, контексты блоков изолированы (как в рантайме).
 */
export function analyzeHtml(text: string, options: AnalyzeHtmlOptions = {}): EmbeddedAnalysis {
  const uri = options.uri ?? 'file:///embedded.html';
  const version = options.version ?? 0;
  const document = TextDocument.create(uri, HTML_LANGUAGE_ID, version, text);

  const blocks: EmbeddedBlock[] = findBlocks(text).map((block, index) => {
    const blockText = text.slice(block.contentStartOffset, block.contentEndOffset);
    return {
      ...block,
      index,
      text: blockText,
      document: TextDocument.create(`${uri}#block-${index}`, 'osjs', version, blockText),
      analysis: analyze(blockText),
      html: document,
    };
  });

  return { uri, version, text, document, blocks };
}

const UNTERMINATED_STRING = 'Незакрытый строковый литерал';

const OSJS4001_MESSAGE = [
  'Блок оборван на «</script>»: последовательность «</script>» внутри BSL-кода обрывает',
  'HTML-блок (raw text), и код после неё не исполняется. Закройте строку/выражение до тега',
  'или запишите строку безопасно — например, склейкой частей: "</scr" + "ipt>".',
].join(' ');

const OSJS4002_MESSAGE =
  'Последовательность «<script»/«<!--» в блоке включает legacy-состояние script-data и может исказить разбор HTML. Запишите её безопасно — например, склейкой строковых частей.';

function tokenStartOffset(block: EmbeddedBlock, token: Token): number {
  const trim = token.lexeme.endsWith('\r') ? 1 : 0;
  return block.document.offsetAt({
    line: Math.max(0, token.line - 1),
    character: Math.max(0, token.column - 1 - trim),
  });
}

/** Последний значимый токен блока: всё, что начинается не раньше, — «конец блока». */
function lastSignificantStart(block: EmbeddedBlock): number {
  for (let i = block.analysis.tokens.length - 1; i >= 0; i -= 1) {
    const token = block.analysis.tokens[i];
    if (token === undefined || token.type === TokenType.EndOfFile) continue;
    return tokenStartOffset(block, token);
  }
  return 0;
}

function isBlockClosed(analysis: EmbeddedAnalysis, block: EmbeddedBlock): boolean {
  return block.contentEndOffset < analysis.text.length;
}

function diagnosticMessage(diagnostic: Diagnostic): string {
  return typeof diagnostic.message === 'string' ? diagnostic.message : diagnostic.message.value;
}

/** Error-правило OSJS4001: `</script>` оборвал строку или выражение блока. */
function brokenByCloseTag(
  analysis: EmbeddedAnalysis,
  block: EmbeddedBlock,
): Diagnostic | undefined {
  if (!isBlockClosed(analysis, block)) return undefined;
  const unterminated = block.analysis.diagnostics.find(
    (diagnostic) =>
      diagnostic.code === 'OSJS1001' &&
      diagnosticMessage(diagnostic).includes(UNTERMINATED_STRING),
  );
  const lastStart = lastSignificantStart(block);
  const parseAtEnd = block.analysis.diagnostics.find(
    (diagnostic) =>
      diagnostic.code === 'OSJS2001' && block.document.offsetAt(diagnostic.range.start) >= lastStart,
  );
  const anchor = unterminated ?? parseAtEnd;
  if (anchor === undefined) return undefined;
  return {
    range: toDocumentRange(block, anchor.range),
    severity: DiagnosticSeverity.Error,
    code: 'OSJS4001',
    source: 'osjs',
    message: OSJS4001_MESSAGE,
  };
}

/** Warning-правило OSJS4002: `<script`/`<!--` внутри содержимого блока. */
function scriptDataWarnings(block: EmbeddedBlock): Diagnostic[] {
  const warnings: Diagnostic[] = [];
  const patterns = [/<script(?=[\s>/])/gi, /<!--/g];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(block.text); match !== null; match = pattern.exec(block.text)) {
      const start = match.index;
      const end = Math.min(start + match[0].length, block.text.length);
      warnings.push({
        range: toDocumentRange(block, {
          start: block.document.positionAt(start),
          end: block.document.positionAt(end),
        }),
        severity: DiagnosticSeverity.Warning,
        code: 'OSJS4002',
        source: 'osjs',
        message: OSJS4002_MESSAGE,
      });
    }
  }
  return warnings;
}

/** Все диагностики блоков в координатах HTML: 014 + OSJS4001/OSJS4002, лимит 200. */
export function embeddedDiagnostics(analysis: EmbeddedAnalysis): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const block of analysis.blocks) {
    for (const diagnostic of block.analysis.diagnostics) {
      diagnostics.push({ ...diagnostic, range: toDocumentRange(block, diagnostic.range) });
    }
    const broken = brokenByCloseTag(analysis, block);
    if (broken !== undefined) diagnostics.push(broken);
    diagnostics.push(...scriptDataWarnings(block));
  }

  const sorted = diagnostics.sort(
    (a, b) =>
      a.range.start.line - b.range.start.line ||
      a.range.start.character - b.range.start.character,
  );
  const seen = new Set<string>();
  const result: Diagnostic[] = [];
  for (const diagnostic of sorted) {
    const key = `${String(diagnostic.code)}:${diagnostic.range.start.line}:${diagnostic.range.start.character}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(diagnostic);
    if (result.length >= MAX_DIAGNOSTICS) break;
  }
  return result;
}

/** Semantic tokens всех блоков в координатах HTML (дельта-кодирование, без пересечений). */
export function embeddedSemanticTokens(analysis: EmbeddedAnalysis): number[] {
  if (analysis.document.lineCount > MAX_SEMANTIC_TOKEN_LINES) return [];

  const mapped = [];
  for (const block of analysis.blocks) {
    for (const token of semanticTokenList(block.analysis)) {
      const localOffset = block.document.offsetAt({
        line: token.line,
        character: token.startChar,
      });
      const globalOffset = block.contentStartOffset + localOffset;
      if (globalOffset > block.contentEndOffset) continue;
      const position = analysis.document.positionAt(globalOffset);
      mapped.push({
        line: position.line,
        startChar: position.character,
        length: token.length,
        tokenType: token.tokenType,
        modifiers: token.modifiers,
      });
    }
  }
  return encodeSemanticTokens(mapped);
}
