// スペース（メモの保管先。仕事用と個人用のように分けて、切り替えて使う）の一覧と、いま開いているスペース。
// スペースごとに、手元の保存（IndexedDB）・同期先・暗号化キーが別になる。パスフレーズは、このデバイスで共通。
// 一覧はメモの中身ではないので暗号化せず、ロック解除の前の画面でも読めるように localStorage に置く。同期はしない。

import { useSyncExternalStore } from "react";
import { isRandomId, newRandomId } from "../../core/crypto/randomId";

// スペースを足す前からある、最初のスペース。手元の保存の名前は、スペースを足す前と同じ。
export const FIRST_SPACE_ID = "first";
const FIRST_SPACE_DATABASE_NAME = "sedum-note";
const STORAGE_KEY = "sedum-note:spaces";

export type Space = {
  id: string;
  // 利用者が付けた名前。付けていなければ空（画面は、決まった呼び名を出す）。
  name: string;
};

export type SpaceRegistry = { spaces: Space[]; activeSpaceId: string };

const INITIAL_REGISTRY: SpaceRegistry = { spaces: [{ id: FIRST_SPACE_ID, name: "" }], activeSpaceId: FIRST_SPACE_ID };

let current: SpaceRegistry | null = null;
const listeners = new Set<() => void>();

function isSpace(value: unknown): value is Space {
  const candidate = value as Partial<Space> | null;
  return typeof candidate === "object" && candidate !== null && typeof candidate.name === "string" &&
    typeof candidate.id === "string" && (candidate.id === FIRST_SPACE_ID || isRandomId(candidate.id));
}

// 読めない一覧（手で書き換えた値など）は、最初のスペースだけの一覧として扱う。
function validRegistry(stored: unknown): SpaceRegistry {
  const candidate = stored as Partial<SpaceRegistry> | null;
  const spaces = Array.isArray(candidate?.spaces) ? candidate.spaces.filter(isSpace) : [];
  if (spaces.length === 0) {
    return INITIAL_REGISTRY;
  }
  const activeSpaceId = spaces.some((space) => space.id === candidate?.activeSpaceId) ? String(candidate?.activeSpaceId) : spaces[0]!.id;
  return { spaces, activeSpaceId };
}

function loadRegistry(): SpaceRegistry {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? INITIAL_REGISTRY : validRegistry(JSON.parse(stored));
  } catch {
    return INITIAL_REGISTRY;
  }
}

export function readSpaceRegistry(): SpaceRegistry {
  current ??= loadRegistry();
  return current;
}

function writeRegistry(registry: SpaceRegistry): void {
  current = registry;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(registry));
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // ほかのウィンドウ（Web 版ならほかのタブ）でスペースを足した・切り替えたときも、読み直す。
  const reload = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      current = loadRegistry();
      listener();
    }
  };
  window.addEventListener("storage", reload);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", reload);
  };
}

export function useSpaceRegistry(): SpaceRegistry {
  return useSyncExternalStore(subscribe, readSpaceRegistry);
}

// スペースを足して、そのスペースに切り替える。保存先は、最初に開いたときの設定（パスフレーズの確認）で作る。
export function addSpace(name: string): Space {
  const space = { id: newRandomId(), name };
  writeRegistry({ spaces: [...readSpaceRegistry().spaces, space], activeSpaceId: space.id });
  return space;
}

export function selectSpace(spaceId: string): void {
  const registry = readSpaceRegistry();
  if (registry.spaces.some((space) => space.id === spaceId)) {
    writeRegistry({ ...registry, activeSpaceId: spaceId });
  }
}

export function renameSpace(spaceId: string, name: string): void {
  const registry = readSpaceRegistry();
  writeRegistry({ ...registry, spaces: registry.spaces.map((space) => (space.id === spaceId ? { ...space, name } : space)) });
}

// スペースを一覧から外す（手元の保存を消すのは、呼び出し側）。開いていたスペースなら、残りの先頭に切り替える。
// 最後の 1 つは外さない。
export function removeSpaceFromRegistry(spaceId: string): void {
  const registry = readSpaceRegistry();
  const spaces = registry.spaces.filter((space) => space.id !== spaceId);
  if (spaces.length === 0) {
    return;
  }
  writeRegistry({ spaces, activeSpaceId: registry.activeSpaceId === spaceId ? spaces[0]!.id : registry.activeSpaceId });
}

// 「このデバイスのデータを消す」で使う。最初のスペースだけの一覧に戻す。
export function resetSpaceRegistry(): void {
  current = INITIAL_REGISTRY;
  localStorage.removeItem(STORAGE_KEY);
  listeners.forEach((listener) => listener());
}

// スペースの、手元の保存（IndexedDB）の名前。
export function databaseNameOfSpace(spaceId: string): string {
  return spaceId === FIRST_SPACE_ID ? FIRST_SPACE_DATABASE_NAME : `${FIRST_SPACE_DATABASE_NAME}:space:${spaceId}`;
}
