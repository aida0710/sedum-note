// AES-256-GCM で 1 件のデータを封じる・開く。
//
// 封じたバイト列の形: [形式の版 1 バイト][nonce 12 バイト][暗号文＋タグ]。
// binding（追加認証データ）には「何のデータか」（種類と ID）を入れる。S3 の
// 管理者が暗号文を別のキーへ入れ替えても、開くときに binding が合わず失敗する。

const SEALED_BOX_VERSION = 1;
const NONCE_LENGTH = 12;
const HEADER_LENGTH = 1 + NONCE_LENGTH;
// GCM のタグは 16 バイト。これより短いものは開く前に断る。
const TAG_LENGTH = 16;

export class SealedBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SealedBoxError";
  }
}

const textEncoder = new TextEncoder();

function bindingBytes(binding: string): Uint8Array<ArrayBuffer> {
  return textEncoder.encode(binding);
}

export async function seal(key: CryptoKey, plaintext: Uint8Array, binding: string): Promise<Uint8Array> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: bindingBytes(binding) },
    key,
    plaintext as Uint8Array<ArrayBuffer>,
  );
  const sealed = new Uint8Array(HEADER_LENGTH + ciphertext.byteLength);
  sealed[0] = SEALED_BOX_VERSION;
  sealed.set(nonce, 1);
  sealed.set(new Uint8Array(ciphertext), HEADER_LENGTH);
  return sealed;
}

export async function open(key: CryptoKey, sealed: Uint8Array, binding: string): Promise<Uint8Array> {
  if (sealed.length < HEADER_LENGTH + TAG_LENGTH || sealed[0] !== SEALED_BOX_VERSION) {
    throw new SealedBoxError("not a sealed box of a supported version");
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: sealed.slice(1, HEADER_LENGTH), additionalData: bindingBytes(binding) },
      key,
      sealed.slice(HEADER_LENGTH),
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new SealedBoxError("the key or the binding does not open this box");
  }
}

export async function importAesKey(rawKey: Uint8Array, extractable: boolean): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", rawKey as Uint8Array<ArrayBuffer>, "AES-GCM", extractable, [
    "encrypt",
    "decrypt",
  ]);
}
