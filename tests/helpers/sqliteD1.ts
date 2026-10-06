import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

class SqliteD1Statement {
  private values: unknown[] = [];
  private readonly statement;

  constructor(private readonly database: DatabaseSync, sql: string) {
    this.statement = database.prepare(sql);
  }

  bind(...values: unknown[]): this {
    this.values = values;
    return this;
  }

  run(): { success: true; meta: { changes: number; last_row_id: number } } {
    const result = this.statement.run(...this.values as never[]);
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }

  first<T>(columnName?: string): T | null {
    const row = this.statement.get(...this.values as never[]) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (columnName ? row[columnName] : row) as T;
  }

  all<T>(): { success: true; results: T[]; meta: { changes: number } } {
    const results = this.statement.all(...this.values as never[]) as T[];
    return { success: true, results, meta: { changes: 0 } };
  }
}

/** Minimal SQLite-backed D1 contract for exercising the real Worker route locally. */
export class SqliteD1 {
  private readonly database: DatabaseSync;

  constructor(databasePath = ':memory:') {
    this.database = new DatabaseSync(databasePath);
    this.database.exec('PRAGMA foreign_keys=ON');
  }

  prepare(sql: string): SqliteD1Statement {
    return new SqliteD1Statement(this.database, sql);
  }

  batch<T extends SqliteD1Statement>(statements: T[]): Array<ReturnType<T['run']>> {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map(statement => statement.run()) as Array<ReturnType<T['run']>>;
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  migrate(repositoryRoot: string): void {
    const directory = join(repositoryRoot, 'worker', 'migrations');
    for (const name of readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) {
      this.database.exec(readFileSync(join(directory, name), 'utf8'));
    }
  }

  close(): void {
    this.database.close();
  }
}
