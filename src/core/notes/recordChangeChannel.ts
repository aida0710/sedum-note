// 手元の保存に記録を書いたことを、同じ保存を開いているほかのウィンドウ（Web 版ならほかのタブ）へ知らせる通り道。
// 知らせるのは記録の ID だけ。受けた側は、手元の保存からその記録を読み直して、開いている文書へマージする
// （notes/noteRepository.ts）。記録の中身は、この通り道には流さない。

export interface RecordChangeChannel {
  // このウィンドウが、記録を手元の保存に書いた。
  announce(recordId: string): void;
  // ほかのウィンドウが書いた記録の ID を受け取る。自分が知らせたものは届かない。
  subscribe(listener: (recordId: string) => void): () => void;
}

// 試験用。同じ hub から作った通り道どうしが、互いの知らせを受け取る。
export class MemoryRecordChangeHub {
  readonly #listenersByChannel = new Map<object, Set<(recordId: string) => void>>();

  createChannel(): RecordChangeChannel {
    const channel = {};
    const listeners = new Set<(recordId: string) => void>();
    this.#listenersByChannel.set(channel, listeners);
    return {
      announce: (recordId) => {
        for (const [other, otherListeners] of this.#listenersByChannel) {
          if (other !== channel) {
            otherListeners.forEach((listener) => listener(recordId));
          }
        }
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  }
}
