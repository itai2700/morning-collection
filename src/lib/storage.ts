import { getDb } from "./db";

export function hasDatabase() {
  return Boolean(getDb());
}
