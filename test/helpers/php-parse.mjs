// 後端 TinyDB::parseQueryString() 的 JavaScript 移植，只用於測試序列化結果
// 是否會被後端解析成預期的參數（libraries/TinyDB.php）。

export function phpUrldecode(s) {
  return decodeURIComponent(s.replace(/\+/g, " "));
}

export function parseQueryString(qs) {
  const result = {};
  if (qs === "") return result;
  for (const pair of qs.split("&")) {
    if (pair === "") continue;
    const decoded = phpUrldecode(pair);
    let m = decoded.match(/^([^><=&]+)(>=|<=)(.+)$/);
    if (m) {
      const field = m[1].trim();
      const op = m[2] === ">=" ? "gte" : "lte";
      if (field !== "" && m[3] !== "") ((result.__range__ ??= {})[field] ??= {})[op] = m[3];
      continue;
    }
    m = decoded.match(/^([^><=&]+)(>|<)(.+)$/);
    if (m) {
      const field = m[1].trim();
      const op = m[2] === ">" ? "gt" : "lt";
      if (field !== "" && m[3] !== "") ((result.__range__ ??= {})[field] ??= {})[op] = m[3];
      continue;
    }
    if (!pair.includes("=")) continue;
    const i = pair.indexOf("=");
    const key = phpUrldecode(pair.slice(0, i));
    const val = phpUrldecode(pair.slice(i + 1));
    const qm = key.match(/^q\[(.+)\]$/);
    if (qm) {
      if (typeof result.q !== "object" || result.q === null || Array.isArray(result.q)) result.q = {};
      result.q[qm[1]] = val;
    } else if (Object.prototype.hasOwnProperty.call(result, key)) {
      result[key] = [].concat(result[key], [val]);
    } else {
      result[key] = val;
    }
  }
  return result;
}
