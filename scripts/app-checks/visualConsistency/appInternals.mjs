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
export async function exposeParagraphWriter(page) {
  await exposeApp(page);
  await page.evaluate(async () => {
    const yjsUrl = performance.getEntriesByType("resource").map((entry) => entry.name).find((name) => /\/deps\/yjs\.js/.test(name));
    if (!yjsUrl) throw new Error("アプリが読み込んだ yjs のモジュールが見つかりません");
    const Y = await import(yjsUrl);
    window.__visualAuditSeed = {
      addParagraphs(noteId, texts) {
        const note = window.__visualAudit.repository.note(noteId);
        note.body.doc.transact(() => {
          const paragraphs = texts.map((text) => {
            const paragraph = new Y.XmlElement("paragraph");
            const content = new Y.XmlText();
            content.insert(0, text);
            paragraph.insert(0, [content]);
            return paragraph;
          });
          note.body.insert(note.body.length, paragraphs);
        });
      },
    };
  });
}
