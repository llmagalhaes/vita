/**
 * Jest mock of expo-sqlite backed by node:sqlite (Node 22+): real SQL runs in
 * tests. Only the surface src/db uses is implemented.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require("node:sqlite");

type Param = string | number | null;

class MockDatabase {
  private db = new DatabaseSync(":memory:");

  execSync(sql: string): void {
    this.db.exec(sql);
  }
  runSync(sql: string, params: Param[] = []): void {
    this.db.prepare(sql).run(...params);
  }
  getAllSync<T>(sql: string, params: Param[] = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }
  getFirstSync<T>(sql: string, params: Param[] = []): T | null {
    return (this.db.prepare(sql).get(...params) as T | undefined) ?? null;
  }
  withTransactionSync(fn: () => void): void {
    this.db.exec("BEGIN");
    try {
      fn();
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  closeSync(): void {
    this.db.close();
  }
}

export function openDatabaseSync(_name: string): MockDatabase {
  return new MockDatabase();
}
