// アプリの部品の props（React の fiber）から、vault・repository・navigation を取り出す。
// 画面の文言に頼らずにメモを開く（英語の画面）ときと、最悪のデータを repository へ直に入れるときに使う。開発サーバーの画面でだけ動く。

// 開いている画面の vault と navigation を window.__visualAudit に置く。navigation は描画のたびに作り直されるので、使う直前に呼ぶ。
export async function exposeApp(page) {
  await page.evaluate(() => {
    const root = document.querySelector(".workspace, .phone");
    const fiberKey = Object.keys(root).find((name) => name.startsWith("__reactFiber$"));
    for (let fiber = root[fiberKey]; fiber; fiber = fiber.return) {
      const props = fiber.memoizedProps;
      if (props?.vault && props.navigation) {
        window.__visualAudit = { vault: props.vault, repository: props.vault.repository, navigation: props.navigation };
        return;
      }
    }
    throw new Error("アプリの vault と navigation が見つかりません");
  });
}

// navigation の関数（openNote・openTab など）を呼ぶ。
export async function navigate(page, method, ...args) {
  await exposeApp(page);
  await page.evaluate(({ method, args }) => window.__visualAudit.navigation[method](...args), { method, args });
}

// アプリが読み込んだのと同じ yjs のモジュールで、メモの本文の末尾に段落を足す関数を window.__visualAuditSeed に置く。
// repository.createNote は題などの項目だけを作るので、一覧の要約に出る本文はこれで入れる。
// 段落を足すのは試験の道具（src/core/notes/bodyFixtures.ts）。開発サーバーは、src のモジュールの "yjs" を、アプリと同じ
// 読み込み先（node_modules/.vite/deps の同じ版）に書き換えて返すので、別の yjs を読み込んで本文の型が食い違うことがない。
export async function exposeParagraphWriter(page) {
  await exposeApp(page);
  await page.evaluate(async () => {
    const { appendParagraph } = await import(`${location.origin}/src/core/notes/bodyFixtures.ts`);
    window.__visualAuditSeed = {
      addParagraphs(noteId, texts) {
        const note = window.__visualAudit.repository.note(noteId);
        note.body.doc.transact(() => {
          for (const text of texts) appendParagraph(note.body, text);
        });
      },
    };
  });
}
