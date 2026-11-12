// 試験で使う、小さな WebAssembly のモジュールを、バイト列で組み立てる（決まりに合わないプラグインの真似）。
// WebAssembly のバイナリの形（セクションの並び）を、必要な分だけ書いている。

const HEADER = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
const SECTION = { type: 1, import: 2, function: 3, memory: 5, export: 7, start: 8, code: 10, data: 11 } as const;
const I32 = 0x7f;
const I64 = 0x7e;
const END = 0x0b;

function unsignedLeb128(value: number): number[] {
  const bytes: number[] = [];
  let rest = value >>> 0;
  do {
    const byte = rest & 0x7f;
    rest >>>= 7;
    bytes.push(rest === 0 ? byte : byte | 0x80);
  } while (rest !== 0);
  return bytes;
}

function signedLeb128(value: bigint): number[] {
  const bytes: number[] = [];
  let rest = value;
  for (;;) {
    const byte = Number(rest & 0x7fn);
    rest >>= 7n;
    const isLast = (rest === 0n && (byte & 0x40) === 0) || (rest === -1n && (byte & 0x40) !== 0);
    bytes.push(isLast ? byte : byte | 0x80);
    if (isLast) {
      return bytes;
    }
  }
}

const vector = (items: number[][]) => [...unsignedLeb128(items.length), ...items.flat()];
const name = (text: string) => { const bytes = [...new TextEncoder().encode(text)]; return [...unsignedLeb128(bytes.length), ...bytes]; };
const section = (id: number, content: number[]) => [id, ...unsignedLeb128(content.length), ...content];
const functionType = (parameters: number[], results: number[]) => [0x60, ...vector(parameters.map((type) => [type])), ...vector(results.map((type) => [type]))];
const functionBody = (instructions: number[]) => { const body = [0x00, ...instructions, END]; return [...unsignedLeb128(body.length), ...body]; };

// 外の関数を 1 つ取り込むモジュール（決まりでは、取り込みは 1 つも許さない）。
export function moduleWithImport(): Uint8Array {
  return new Uint8Array([
    ...HEADER,
    ...section(SECTION.type, vector([functionType([], [])])),
    ...section(SECTION.import, vector([[...name("env"), ...name("fetch"), 0x00, 0x00]])),
  ]);
}

// メモリだけを出していて、決まった名前の関数が無いモジュール。
export function moduleWithoutFunctions(): Uint8Array {
  return new Uint8Array([
    ...HEADER,
    ...section(SECTION.memory, vector([[0x00, 0x01]])),
    ...section(SECTION.export, vector([[...name("memory"), 0x02, 0x00]])),
  ]);
}

// 入力を読まずに、決まった出力を返すモジュール。
const OUTPUT_OFFSET = 1024;
const INPUT_OFFSET = 8192;

type FixedOutputModule = {
  // メモリに置いておく出力のバイト列。
  output: Uint8Array;
  // sedum_run が返す出力の位置と長さ。指定しなければ、output を指す。
  claimedPointer?: number;
  claimedLength?: number;
  // 組み立てたときに走る関数（start）を、終わらないループにする。
  loopsOnStart?: boolean;
};

export function moduleReturning({ output, claimedPointer = OUTPUT_OFFSET, claimedLength = output.length, loopsOnStart = false }: FixedOutputModule): Uint8Array {
  const packed = (BigInt(claimedPointer) << 32n) | BigInt(claimedLength);
  const loop = [0x03, 0x40, 0x0c, 0x00, END];
  return new Uint8Array([
    ...HEADER,
    ...section(SECTION.type, vector([functionType([I32], [I32]), functionType([I32, I32], [I64]), functionType([], [])])),
    ...section(SECTION.function, vector([[0x00], [0x01], [0x02]])),
    ...section(SECTION.memory, vector([[0x00, 0x01]])),
    ...section(SECTION.export, vector([[...name("memory"), 0x02, 0x00], [...name("sedum_alloc"), 0x00, 0x00], [...name("sedum_run"), 0x00, 0x01]])),
    ...(loopsOnStart ? section(SECTION.start, unsignedLeb128(2)) : []),
    ...section(SECTION.code, vector([
      functionBody([0x41, ...signedLeb128(BigInt(INPUT_OFFSET))]),
      functionBody([0x42, ...signedLeb128(BigInt.asIntN(64, packed))]),
      functionBody(loopsOnStart ? loop : []),
    ])),
    ...section(SECTION.data, vector([[0x00, 0x41, ...signedLeb128(BigInt(OUTPUT_OFFSET)), END, ...unsignedLeb128(output.length), ...output]])),
  ]);
}

export function moduleReturningText(text: string, options: Omit<FixedOutputModule, "output"> = {}): Uint8Array {
  return moduleReturning({ output: new TextEncoder().encode(text), ...options });
}
