import type { BslBackgroundTask } from './task';

interface RegistryEntry {
  task: BslBackgroundTask;
  completed: boolean;
}

/**
 * Реестр заданий менеджера (аналог `BackgroundTasksRegistry` эталона).
 * Активные — в порядке запуска, завершённые — в порядке завершения. При переполнении
 * вытесняются ранее всех завершившиеся; активные не вытесняются никогда.
 */
export class BackgroundTasksRegistry {
  private entries: RegistryEntry[] = [];

  constructor(readonly capacity = 1000) {}

  /** Снимок: активные в порядке запуска, затем завершённые в порядке завершения. */
  values(): BslBackgroundTask[] {
    return this.entries.map((entry) => entry.task);
  }

  add(task: BslBackgroundTask): boolean {
    if (this.entries.some((entry) => entry.task === task)) return false;
    const firstCompleted = this.entries.findIndex((entry) => entry.completed);
    if (firstCompleted === -1) this.entries.push({ task, completed: false });
    else this.entries.splice(firstCompleted, 0, { task, completed: false });
    this.evictIfNeeded();
    return true;
  }

  /** Завершённое задание переносится в конец очереди завершённых. */
  markCompleted(task: BslBackgroundTask): void {
    const index = this.entries.findIndex((entry) => entry.task === task);
    if (index === -1 || this.entries[index]!.completed) return;
    const [entry] = this.entries.splice(index, 1);
    if (!entry) return;
    entry.completed = true;
    this.entries.push(entry);
    this.evictIfNeeded();
  }

  remove(task: BslBackgroundTask): void {
    const index = this.entries.findIndex((entry) => entry.task === task);
    if (index !== -1) this.entries.splice(index, 1);
  }

  clear(): void {
    this.entries = [];
  }

  private evictIfNeeded(): void {
    while (this.entries.length > this.capacity) {
      const firstCompleted = this.entries.findIndex((entry) => entry.completed);
      if (firstCompleted === -1) return; // активные не вытесняем
      this.entries.splice(firstCompleted, 1);
    }
  }
}
