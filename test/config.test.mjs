import { test } from "node:test";
import assert from "node:assert/strict";
import { PRODUCTION_BASE_URL, checkToken, loadConfig, resolveBaseUrl } from "../build/lib/config.js";

test("預設固定使用正式站", () => {
  const c = loadConfig({ OPENFUN_API_TOKEN: "ofk_abc_long_enough_token" });
  assert.equal(c.baseUrl, PRODUCTION_BASE_URL);
  assert.equal(c.baseUrl, "https://data.openfun.tw");
  assert.equal(c.isDevOverride, false);
  assert.equal(c.token, "ofk_abc_long_enough_token");
});

test("開發覆寫只接受 loopback", () => {
  assert.equal(resolveBaseUrl("http://127.0.0.1:8080").baseUrl, "http://127.0.0.1:8080");
  assert.equal(resolveBaseUrl("http://localhost:3000/").baseUrl, "http://localhost:3000");
  assert.equal(resolveBaseUrl("http://[::1]:3000").baseUrl, "http://[::1]:3000");
  for (const bad of [
    "https://evil.example",
    "http://127.0.0.1.evil.example",
    "http://user:pw@127.0.0.1:1",
    "http://127.0.0.1:1/path",
    "http://127.0.0.1:1/?token=x",
    "file:///etc/passwd",
    "not a url",
    "http://10.0.0.1",
  ]) {
    assert.throws(() => resolveBaseUrl(bad), Error, bad);
  }
});

test("Token 檢查：空值、未替換變數、Bearer 前綴、空白、換行", () => {
  assert.deepEqual(checkToken(undefined), { token: null, problem: null });
  assert.deepEqual(checkToken("   "), { token: null, problem: null });
  assert.deepEqual(checkToken("${user_config.api_token}"), { token: null, problem: null });
  const real = "ofk_" + "0123456789abcdef".repeat(4);
  assert.equal(real.length, 68, "後端產生的 Token 長度");
  assert.equal(checkToken(`  ${real} \n`).token, real);
  assert.equal(checkToken("x".repeat(20)).token, "x".repeat(20));
  for (const bad of ["Bearer ofk_abc", "ofk abc", "ofk_\r\nX-Evil: 1", "ofk_中文", "x".repeat(600), "ofk_abc", "a", "x".repeat(19)]) {
    const r = checkToken(bad);
    assert.equal(r.token, null, bad);
    assert.ok(r.problem);
    assert.ok(!r.problem.includes("ofk_"), "問題說明不可包含 Token");
  }
});

test("timeout 開發覆寫有上下限", () => {
  assert.equal(loadConfig({ OPENFUN_DEV_TIMEOUT_MS: "1" }).timeoutMs, 50);
  assert.equal(loadConfig({ OPENFUN_DEV_TIMEOUT_MS: "99999999" }).timeoutMs, 120000);
  assert.equal(loadConfig({}).timeoutMs, 20000);
});
