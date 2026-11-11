// WebView のページを、DevTools の口（CDP の WebSocket）から直接操作する小さな道具。
//
// Android の配布用のアプリの WebView には、中身の無いページがもう 1 つ見えることがあり、
// Playwright の connectOverCDP はそれへつなごうとして止まる。ここでは、アプリの画面のページだけに
// つなぎ、文言で部品を探して押す・打つ・待つ、だけを行う。

const POLL_INTERVAL_MILLISECONDS = 250;
const DEFAULT_WAIT_MILLISECONDS = 30_000;

export async function connectToAppPage(devToolsPort) {
  const targets = await (await fetch(`http://127.0.0.1:${devToolsPort}/json/list`)).json();
  const target = targets.find((candidate) => candidate.type === "page" && candidate.url.startsWith("http"));
  if (!target) {
    throw new Error("the app page was not found in the DevTools target list");
  }
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const pending = new Map();
  let nextId = 1;
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const waiting = pending.get(message.id);
    if (waiting) {
      pending.delete(message.id);
      if (message.error) {
        waiting.reject(new Error(message.error.message));
      } else {
        waiting.resolve(message.result);
      }
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  // ページの中で式を評価して、値を返す。
  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      throw new Error(`evaluation failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
    }
    return result.result.value;
  }

  async function waitFor(description, expression, timeout = DEFAULT_WAIT_MILLISECONDS) {
    const deadline = Date.now() + timeout;
    for (;;) {
      const value = await evaluate(expression);
      if (value) {
        return value;
      }
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for ${description}`);
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MILLISECONDS));
    }
  }

  // 見えているボタンを、文言（中の文字か aria-label）で探す式。
  const buttonExpression = (name) => `[...document.querySelectorAll("button")].find((button) =>
    (button.getAttribute("aria-label") ?? button.textContent.trim()) === ${JSON.stringify(name)} && button.offsetParent !== null)`;

  return {
    evaluate,
    waitFor,
    waitForText: (text, timeout) => waitFor(`the text ${text}`, `document.body.innerText.includes(${JSON.stringify(text)})`, timeout),
    async clickButton(name) {
      await waitFor(`the button ${name}`, `Boolean(${buttonExpression(name)})`);
      await evaluate(`${buttonExpression(name)}.click()`);
    },
    // ラベルの付いた入力欄に打つ。キーボードから打ったのと同じ経路（Input.insertText）で入れる。
    async fillByLabel(label, text) {
      const controlExpression = `document.getElementById([...document.querySelectorAll("label")].find((element) => element.textContent.trim() === ${JSON.stringify(label)})?.htmlFor)`;
      await waitFor(`the field ${label}`, `Boolean(${controlExpression})`);
      await evaluate(`(() => { const control = ${controlExpression}; control.focus(); control.select(); })()`);
      await send("Input.insertText", { text });
    },
    // CSS のセレクターで選んだ入力欄に打つ（ラベルの無い欄。メモのタイトルなど）。
    async fillBySelector(selector, text) {
      const controlExpression = `document.querySelector(${JSON.stringify(selector)})`;
      await waitFor(`the field ${selector}`, `Boolean(${controlExpression})`);
      await evaluate(`(() => { const control = ${controlExpression}; control.focus(); control.select(); })()`);
      await send("Input.insertText", { text });
    },
    reload: () => send("Page.reload"),
    close: () => socket.close(),
  };
}
