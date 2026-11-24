import { DebugSession } from '@vscode/debugadapter';
import { OsjsDebugSession } from './debug/session';

// ENTRY: `DebugSession.run` захватывает process.stdin/stdout, поэтому логика сессии
// живёт в session.ts — тесты импортируют её, не запуская stdio-протокол.
DebugSession.run(OsjsDebugSession);
