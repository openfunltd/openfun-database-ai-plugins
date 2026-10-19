/** Minimal OOXML workbook: two sheets, explicit cell types, no formulas/macros/external links. */
import { strToU8, zipSync } from "fflate";
import { OpenFunError } from "./errors.js";

export type Cell = string | number | boolean | null;
export interface Sheet {
  name: string;
  rows: Cell[][];
  filter?: boolean;
}

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const MAX_XML_BYTES = 96 * 1024 * 1024;

function xml(value: string): string {
  // Reject instead of silently losing data that a worksheet cannot represent.
  if (value.length > 32767 || /[\x00-\x08\x0b\x0c\x0e-\x1f\ud800-\udfff\ufffe\uffff]/u.test(value)) {
    throw new OpenFunError("validation", "資料包含 Excel 無法完整表示的長文字或字元，匯出已停止；請減少輸出欄位。");
  }
  return value
    .replace(/_x[0-9a-fA-F]{4}_/g, (s) => `_x005F_${s.slice(1)}`)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/\r/g, "&#13;");
}

function column(n: number): string {
  let name = "";
  for (n++; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
  return name;
}

function cell(value: Cell, ref: string, header: boolean): string {
  if (value === null) return `<c r="${ref}"/>`;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
      throw new OpenFunError("validation", "資料含無法可靠表示的數字，匯出已停止，未建立完整 Excel。");
    }
    // Excel numbers keep only 15 significant digits. Preserve longer values as text.
    if (value.toString().replace(/[-.e+]/gi, "").length <= 15) return `<c r="${ref}" s="2"><v>${value}</v></c>`;
  }
  if (typeof value === "boolean") return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  // inlineStr preserves leading zeroes and formula-looking strings without executing them.
  return `<c r="${ref}" t="inlineStr" s="${header ? 1 : 0}"><is><t xml:space="preserve">${xml(String(value))}</t></is></c>`;
}

export function makeWorkbook(sheets: Sheet[]): Uint8Array {
  if (sheets.length !== 2) throw new Error("Expected two export worksheets");
  const entries: Record<string, Uint8Array> = {};
  let bytes = 0;
  const put = (name: string, text: string) => {
    const data = strToU8(XML + text);
    bytes += data.length;
    if (bytes > MAX_XML_BYTES) throw new OpenFunError("too_large", "Excel 超過安全大小上限，未建立檔案；請縮小條件或減少欄位。");
    entries[name] = data;
  };
  put("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") + "</Types>");
  put("_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  put("xl/workbook.xml", `<workbook xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` + sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") + "</sheets></workbook>");
  put("xl/_rels/workbook.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") + '<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  put("xl/styles.xml", `<styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  for (const [i, sheet] of sheets.entries()) {
    const width = Math.max(1, ...sheet.rows.map((row) => row.length));
    if (width > 200 || sheet.rows.length > 10001) throw new OpenFunError("too_large", "Excel 超過匯出欄位或筆數上限。");
    const end = `${column(width - 1)}${Math.max(1, sheet.rows.length)}`;
    let text = `<worksheet xmlns="${NS}"><dimension ref="A1:${end}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="${width}" width="24" customWidth="1"/></cols><sheetData>`;
    for (const [n, row] of sheet.rows.entries()) text += `<row r="${n + 1}">` + row.map((v, c) => cell(v, `${column(c)}${n + 1}`, n === 0)).join("") + "</row>";
    text += "</sheetData>" + (sheet.filter ? `<autoFilter ref="A1:${end}"/>` : "") + "</worksheet>";
    put(`xl/worksheets/sheet${i + 1}.xml`, text);
  }
  return zipSync(entries, { level: 6 });
}
