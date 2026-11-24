import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const sqlite = new DatabaseSync(file);
  sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    sqlite.exec(readFileSync(new URL('../db/001-schema.sql', import.meta.url), 'utf8'));
    if (sqlite.prepare('PRAGMA user_version').get().user_version < 2) {
      sqlite.exec(readFileSync(new URL('../db/002-native-sales.sql', import.meta.url), 'utf8'));
    }
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    sqlite.close();
    throw error;
  }

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
