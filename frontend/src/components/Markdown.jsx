// Small, dependency-free Markdown renderer for generated documents and chat
// answers: headings, bold/italic/code, bullet and numbered lists, tables.
// React escapes all text, so model output can never inject HTML.

function inline(text, keyPrefix) {
  const parts = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_|\*[^*]+\*)/g;
  let last = 0;
  let match;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith("**")) parts.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) parts.push(<code key={key}>{token.slice(1, -1)}</code>);
    else parts.push(<em key={key}>{token.slice(1, -1)}</em>);
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function splitRow(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

const isTableSeparator = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

export default function Markdown({ text = "" }) {
  const lines = String(text).replace(/\r/g, "").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 5);
      const Tag = `h${level}`;
      blocks.push(<Tag key={i} className="md-heading">{inline(heading[2], `h${i}`)}</Tag>);
      i++;
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push(
        <div className="md-table-wrap" key={`t${i}`}>
          <table className="md-table">
            <thead><tr>{header.map((h, c) => <th key={c}>{inline(h, `th${c}`)}</th>)}</tr></thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>{header.map((_, c) => <td key={c}>{inline(row[c] ?? "", `td${r}-${c}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      blocks.push(<ul key={`u${i}`} className="md-list">{items.map((it, k) => <li key={k}>{inline(it, `u${i}-${k}`)}</li>)}</ul>);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i++;
      }
      blocks.push(<ol key={`o${i}`} className="md-list">{items.map((it, k) => <li key={k}>{inline(it, `o${i}-${k}`)}</li>)}</ol>);
      continue;
    }

    const paragraph = [];
    while (
      i < lines.length && lines[i].trim() &&
      !/^(#{1,4})\s+/.test(lines[i]) && !/^\s*[-*+]\s+/.test(lines[i]) && !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !(lines[i].includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
    ) {
      paragraph.push(lines[i]);
      i++;
    }
    blocks.push(<p key={`p${i}`} className="md-paragraph">{inline(paragraph.join(" "), `p${i}`)}</p>);
  }

  return <div className="markdown">{blocks}</div>;
}
