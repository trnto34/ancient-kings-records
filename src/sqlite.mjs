import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const sqlite = new DatabaseSync(file);
  sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  sqlite.exec(readFileSync(new URL('../db/001-schema.sql', import.meta.url), 'utf8'));

  return {
    prepare(query) {
      const prepared = sqlite.prepare(query);
      return {
        bind(...values) {
          return {
            first: () => prepared.get(...values) ?? null,
            all: () => ({ results: prepared.all(...values) }),
            run: () => ({ meta: prepared.run(...values) }),
          };
        },
      };
    },
    batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(statement => statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    close: () => sqlite.close(),
  };
}
