// パスフレーズから、マスターキーを包むためのキー（KEK）を Argon2id で導出する。
//
// 導出はロック解除のときに 1 回だけ行う。メモ 1 件ごとの暗号化には、導出した
// キーではなくランダムなマスターキー（vault/vaultDocument.ts）を使う。

import { argon2id } from "hash-wasm";
import { base64ToBytes, bytesToBase64 } from "./base64";
import { importAesKey } from "./sealedBox";

export type Argon2idParameters = {
  // 反復の回数。
  iterations: number;
  // 使うメモリ（KiB）。
  memoryKiB: number;
  parallelism: number;
  // base64 の salt。
  salt: string;
};

// 既定値は OWASP の Argon2id の推奨（m=19 MiB, t=2）より重くした値。スマホの
// WebView でもロック解除が数秒に収まることを実機で測ってから変える。
export const DEFAULT_ARGON2ID_COST = { iterations: 3, memoryKiB: 64 * 1024, parallelism: 1 } as const;

// S3 から読んだ vault.json の値はそのまま信じない。極端な値でスマホのメモリを
// 使い切らせる攻撃を防ぐ上限。
const MAX_ITERATIONS = 16;
const MAX_MEMORY_KIB = 512 * 1024;
const MAX_PARALLELISM = 8;
const SALT_LENGTH = 16;
const DERIVED_KEY_LENGTH = 32;

export const MIN_PASSPHRASE_LENGTH = 10;

export class PassphraseKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PassphraseKeyError";
  }
}

export function newArgon2idParameters(cost: Omit<Argon2idParameters, "salt"> = DEFAULT_ARGON2ID_COST): Argon2idParameters {
  return { ...cost, salt: bytesToBase64(crypto.getRandomValues(new Uint8Array(SALT_LENGTH))) };
}

export function checkArgon2idParameters(parameters: Argon2idParameters): void {
  const acceptable =
    Number.isInteger(parameters.iterations) && parameters.iterations >= 1 && parameters.iterations <= MAX_ITERATIONS &&
    Number.isInteger(parameters.memoryKiB) && parameters.memoryKiB >= 8 && parameters.memoryKiB <= MAX_MEMORY_KIB &&
    Number.isInteger(parameters.parallelism) && parameters.parallelism >= 1 && parameters.parallelism <= MAX_PARALLELISM &&
    base64ToBytes(parameters.salt).length >= SALT_LENGTH;
  if (!acceptable) {
    throw new PassphraseKeyError("the key derivation parameters are outside the accepted range");
  }
}

export async function derivePassphraseKey(passphrase: string, parameters: Argon2idParameters): Promise<CryptoKey> {
  checkArgon2idParameters(parameters);
  const derived = await argon2id({
    password: passphrase.normalize("NFC"),
    salt: base64ToBytes(parameters.salt),
    iterations: parameters.iterations,
    memorySize: parameters.memoryKiB,
    parallelism: parameters.parallelism,
    hashLength: DERIVED_KEY_LENGTH,
    outputType: "binary",
  });
  try {
    return await importAesKey(derived, false);
  } finally {
    derived.fill(0);
  }
}
