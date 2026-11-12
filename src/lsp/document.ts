import type { Analysis } from './analysis';
import type { EmbeddedAnalysis } from './embedded';
import { HTML_LANGUAGE_ID } from './html-blocks';

export const OSJS_LANGUAGE_ID = 'osjs';

export interface DocumentState {
  uri: string;
  languageId: string;
  version: number;
  text: string;
  /** Кэш анализа `.osjs` до следующего изменения; сбрасывается на `change`. */
  analysis?: Analysis;
  /** Кэш встроенного анализа HTML до следующего изменения; сбрасывается на `change`. */
  embedded?: EmbeddedAnalysis;
}

/** Состояние открытых документов сервера: `.osjs` и HTML с блоками `<script type="text/osjs">`. */
export class DocumentStore {
  private readonly documents = new Map<string, DocumentState>();

  open(uri: string, languageId: string, version: number, text: string): DocumentState | undefined {
    if (languageId !== OSJS_LANGUAGE_ID && languageId !== HTML_LANGUAGE_ID) {
      this.documents.delete(uri);
      return undefined;
    }
    const state: DocumentState = { uri, languageId, version, text };
    this.documents.set(uri, state);
    return state;
  }

  change(uri: string, version: number, text: string): DocumentState | undefined {
    const state = this.documents.get(uri);
    if (state === undefined) return undefined;
    state.version = version;
    state.text = text;
    state.analysis = undefined;
    state.embedded = undefined;
    return state;
  }

  close(uri: string): void {
    this.documents.delete(uri);
  }

  get(uri: string): DocumentState | undefined {
    return this.documents.get(uri);
  }

  setAnalysis(uri: string, analysis: Analysis): void {
    const state = this.documents.get(uri);
    if (state !== undefined) state.analysis = analysis;
  }

  setEmbedded(uri: string, embedded: EmbeddedAnalysis): void {
    const state = this.documents.get(uri);
    if (state !== undefined) state.embedded = embedded;
  }

  size(): number {
    return this.documents.size;
  }
}
