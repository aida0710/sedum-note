import { describe, expect, it } from "vitest";
import { type RepositoryChangeOrigin, RepositoryChangeNotifier } from "./repositoryChangeNotifier";

describe("RepositoryChangeNotifier", () => {
  it("止めている間の知らせは、終わったときに 1 回にまとまり、このデバイスの変更が混ざれば local になる", async () => {
    const notifier = new RepositoryChangeNotifier();
    const received: RepositoryChangeOrigin[] = [];
    notifier.subscribe((origin) => received.push(origin));
    await notifier.holdWhile(async () => {
      notifier.notify("stored");
      notifier.notify("local");
      notifier.notify("stored");
      expect(received).toEqual([]);
    });
    expect(received).toEqual(["local"]);
  });

  it("入れ子で止めたときは、いちばん外が終わったときに知らせる", async () => {
    const notifier = new RepositoryChangeNotifier();
    const received: RepositoryChangeOrigin[] = [];
    notifier.subscribe((origin) => received.push(origin));
    await notifier.holdWhile(async () => {
      await notifier.holdWhile(async () => notifier.notify("stored"));
      expect(received).toEqual([]);
    });
    expect(received).toEqual(["stored"]);
  });

  it("止めている間の処理が失敗しても、たまった知らせは出す", async () => {
    const notifier = new RepositoryChangeNotifier();
    const received: RepositoryChangeOrigin[] = [];
    notifier.subscribe((origin) => received.push(origin));
    await expect(notifier.holdWhile(async () => {
      notifier.notify("local");
      throw new Error("failed");
    })).rejects.toThrow("failed");
    expect(received).toEqual(["local"]);
  });

  it("何も知らせなかったときは、終わっても知らせない", async () => {
    const notifier = new RepositoryChangeNotifier();
    const received: RepositoryChangeOrigin[] = [];
    notifier.subscribe((origin) => received.push(origin));
    await notifier.holdWhile(async () => undefined);
    expect(received).toEqual([]);
  });
});
