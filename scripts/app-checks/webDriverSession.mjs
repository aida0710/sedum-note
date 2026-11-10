// W3C WebDriver の最小のクライアント。tauri-driver（Linux 版の確認）に話しかける。

export class WebDriverSession {
  constructor(baseUrl, sessionId) {
    this.baseUrl = baseUrl;
    this.sessionId = sessionId;
  }

  static async start(baseUrl, capabilities) {
    const response = await call(`${baseUrl}/session`, "POST", { capabilities: { alwaysMatch: capabilities } });
    return new WebDriverSession(baseUrl, response.sessionId);
  }

  async command(method, path, body) {
    return call(`${this.baseUrl}/session/${this.sessionId}${path}`, method, body);
  }

  async find(cssSelector) {
    const element = await this.command("POST", "/element", { using: "css selector", value: cssSelector });
    return Object.values(element)[0];
  }

  async findByXPath(xpath) {
    const element = await this.command("POST", "/element", { using: "xpath", value: xpath });
    return Object.values(element)[0];
  }

  // 見つかるまで待つ。WebDriver の暗黙の待ちは実装ごとに違うので、自分で繰り返す。
  async waitForXPath(xpath, timeoutMilliseconds) {
    const deadline = Date.now() + timeoutMilliseconds;
    for (;;) {
      try {
        return await this.findByXPath(xpath);
      } catch (error) {
        if (Date.now() > deadline) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  async type(elementId, text) {
    await this.command("POST", `/element/${elementId}/value`, { text });
  }

  async click(elementId) {
    await this.command("POST", `/element/${elementId}/click`, {});
  }

  async screenshotPng() {
    return Buffer.from(await this.command("GET", "/screenshot"), "base64");
  }

  async end() {
    await this.command("DELETE", "");
  }
}

async function call(url, method, body) {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${method} ${url}: ${JSON.stringify(payload.value)}`);
  }
  return payload.value;
}
