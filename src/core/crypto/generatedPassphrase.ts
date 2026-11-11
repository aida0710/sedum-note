// 強いパスフレーズを作る。sshc の同期の暗号化キーと同じ形（`AB12-CD34-EF56-GH78-JK90-MN12` の 29 文字）にする。
//
// 120 ビットの乱数を Crockford の base32 で表す。I・L・O・U が無いので、0 や 1 と読み違えない。
// 区切りの「-」もパスフレーズの一部で、表示されたとおりに入力する。

// 乱数の長さ。5 の倍数にすると、base32（5 ビットで 1 文字）で余りが出ない。
const PASSPHRASE_BYTES = 15;
const GROUP_LENGTH = 4;
const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const BITS_PER_CHARACTER = 5;

export function newGeneratedPassphrase(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(PASSPHRASE_BYTES));
  let bits = 0n;
  for (const byte of bytes) {
    bits = (bits << 8n) | BigInt(byte);
  }
  const characterCount = (PASSPHRASE_BYTES * 8) / BITS_PER_CHARACTER;
  let characters = "";
  for (let index = characterCount - 1; index >= 0; index -= 1) {
    characters += CROCKFORD_ALPHABET[Number((bits >> BigInt(index * BITS_PER_CHARACTER)) & 31n)];
  }
  return characters.match(new RegExp(`.{${GROUP_LENGTH}}`, "g"))!.join("-");
}
