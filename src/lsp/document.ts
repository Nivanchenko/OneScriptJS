import type { Analysis } from './analysis';

export const OSJS_LANGUAGE_ID = 'osjs';

export interface DocumentState {
  uri: string;
  languageId: string;
  version: number;
  text: string;
  /** Кэш анализа до следующего изменения; сбрасывается на `change`. */
  analysis?: Analysis;
}

/** Состояние открытых документов сервера. Хранятся только `.osjs`-документы. */
export class DocumentStore {
  private readonly documents = new Map<string, DocumentState>();

  open(uri: string, languageId: string, version: number, text: string): DocumentState | undefined {
    if (languageId !== OSJS_LANGUAGE_ID) {
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

  size(): number {
    return this.documents.size;
  }
}
