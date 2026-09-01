import { Box, Typography } from '@mui/material';
import { FONT_MONO, FONT_DISPLAY } from '../theme';

// Renders the small slice of Markdown the assistant actually produces —
// paragraphs, bold/italic/code, bullet and numbered lists, headings and
// pipe tables — as styled elements. Anything unrecognised falls through
// as plain text, so a reply is never worse off than before.

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\s][^*]*\*)/g;

function inline(text, keyPrefix = 'i') {
  return String(text).split(INLINE).filter(Boolean).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (/^(\*\*|__).+(\*\*|__)$/.test(part)) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (/^`[^`]+`$/.test(part)) {
      return (
        <Box key={key} component="code" sx={{
          fontFamily: FONT_MONO, fontSize: '0.92em', px: 0.5, py: '1px',
          borderRadius: '4px', bgcolor: 'action.hover',
        }}>
          {part.slice(1, -1)}
        </Box>
      );
    }
    if (/^\*[^*]+\*$/.test(part)) return <em key={key}>{part.slice(1, -1)}</em>;
    return part;
  });
}

const isTableRow = (l) => l.trim().startsWith('|');
const isDivider = (l) => /^\s*\|?[\s:|-]*-{2,}[\s:|-]*\|?\s*$/.test(l);
const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
// Dash bullets don't need a space before bold text ("-**TUE 11-13**"),
// but a bare "*" needs one so a stray italic line isn't mistaken for one.
const bulletOf = (l) => l.match(/^\s*-\s*(.*)$/) || l.match(/^\s*[*•]\s+(.*)$/);
const numberOf = (l) => l.match(/^\s*(\d+)[.)]\s+(.*)$/);
const headingOf = (l) => l.match(/^\s*(#{1,4})\s+(.*)$/);

// Group lines into blocks so lists and tables stay together.
function parse(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i += 1; continue; }

    if (isTableRow(line) && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) { rows.push(cells(lines[i])); i += 1; }
      blocks.push({ type: 'table', head, rows });
      continue;
    }

    const h = headingOf(line);
    if (h) { blocks.push({ type: 'heading', level: h[1].length, text: h[2] }); i += 1; continue; }

    if (bulletOf(line) || numberOf(line)) {
      const items = [];
      const ordered = !!numberOf(line);
      while (i < lines.length && (bulletOf(lines[i]) || numberOf(lines[i]))) {
        const m = bulletOf(lines[i]) || numberOf(lines[i]);
        items.push(ordered ? m[2] : m[1]);
        i += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim()
           && !isTableRow(lines[i]) && !bulletOf(lines[i])
           && !numberOf(lines[i]) && !headingOf(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    if (para.length) blocks.push({ type: 'para', text: para.join('\n') });
  }
  return blocks;
}

export default function MarkdownMessage({ text }) {
  const blocks = parse(text);
  return (
    <Box sx={{ fontSize: '0.85rem', lineHeight: 1.55, '& > *:first-of-type': { mt: 0 } }}>
      {blocks.map((b, i) => {
        if (b.type === 'heading') {
          return (
            <Typography key={i} sx={{
              fontFamily: FONT_DISPLAY, fontWeight: 700, mt: 1.5, mb: 0.5,
              fontSize: b.level <= 2 ? '0.98rem' : '0.9rem',
            }}>
              {inline(b.text, `h${i}`)}
            </Typography>
          );
        }

        if (b.type === 'list') {
          return (
            <Box key={i} component={b.ordered ? 'ol' : 'ul'} sx={{
              m: 0, mt: 0.75, mb: 0.75, pl: b.ordered ? 2.5 : 0,
              listStyle: b.ordered ? 'decimal' : 'none',
            }}>
              {b.items.map((item, j) => (
                <Box key={j} component="li" sx={{
                  display: b.ordered ? 'list-item' : 'flex', gap: 0.9,
                  mb: 0.4, '&::marker': { color: 'secondary.main', fontWeight: 700 },
                }}>
                  {!b.ordered && (
                    <Box component="span" sx={{
                      mt: '7px', width: 4, height: 4, flexShrink: 0,
                      borderRadius: '1px', bgcolor: 'secondary.main',
                    }} />
                  )}
                  <Box component="span">{inline(item, `l${i}-${j}`)}</Box>
                </Box>
              ))}
            </Box>
          );
        }

        if (b.type === 'table') {
          return (
            <Box key={i} sx={{ my: 1, overflowX: 'auto' }}>
              <Box component="table" sx={{
                width: '100%', borderCollapse: 'collapse',
                fontFamily: FONT_MONO, fontSize: '0.74rem',
                border: '1px solid', borderColor: 'divider', borderRadius: '8px',
                overflow: 'hidden',
              }}>
                <Box component="thead">
                  <Box component="tr" sx={{ bgcolor: 'action.hover' }}>
                    {b.head.map((c, j) => (
                      <Box key={j} component="th" sx={{
                        textAlign: 'left', px: 1, py: 0.6, fontWeight: 700,
                        fontSize: '0.66rem', letterSpacing: '0.06em',
                        textTransform: 'uppercase', color: 'text.secondary',
                        borderBottom: '1px solid', borderColor: 'divider',
                        whiteSpace: 'nowrap',
                      }}>
                        {inline(c, `th${i}-${j}`)}
                      </Box>
                    ))}
                  </Box>
                </Box>
                <Box component="tbody">
                  {b.rows.map((row, j) => (
                    <Box key={j} component="tr" sx={{
                      '&:not(:last-of-type) td': { borderBottom: '1px solid' },
                      '& td': { borderColor: 'divider' },
                    }}>
                      {row.map((c, k) => (
                        <Box key={k} component="td" sx={{
                          px: 1, py: 0.55, verticalAlign: 'top',
                          fontWeight: k === 0 ? 600 : 400,
                          color: k === 0 ? 'text.primary' : 'text.secondary',
                        }}>
                          {inline(c, `td${i}-${j}-${k}`)}
                        </Box>
                      ))}
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          );
        }

        return (
          <Typography key={i} sx={{
            fontSize: '0.85rem', lineHeight: 1.55, mt: 1, whiteSpace: 'pre-wrap',
          }}>
            {inline(b.text, `p${i}`)}
          </Typography>
        );
      })}
    </Box>
  );
}
