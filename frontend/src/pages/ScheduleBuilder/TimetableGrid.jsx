import { useMemo } from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { Warning } from '@mui/icons-material';

const ENTRY_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6',
  '#eab308', '#6366f1', '#84cc16', '#06b6d4', '#f43f5e',
];

const HOUR_PX = 56;        // vertical pixels per hour (~0.93px/min)
const DAY_LABELS = {
  MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun',
};

function getColor(courseId) {
  return ENTRY_COLORS[((courseId ?? 0) % ENTRY_COLORS.length + ENTRY_COLORS.length) % ENTRY_COLORS.length];
}

function toMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map((n) => parseInt(n, 10));
  return h * 60 + (m || 0);
}

function fmt(mins) {
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}

// Greedy interval layout: assign each entry a lane; entries that overlap in
// time get placed in side-by-side lanes so nothing stacks on top of another.
function layoutDay(entries) {
  const sorted = [...entries].sort((a, b) => a.start - b.start || a.end - b.end);
  const out = [];
  let cluster = [];
  let clusterEnd = -1;

  const flush = () => {
    const laneEnds = [];
    cluster.forEach((e) => {
      let lane = laneEnds.findIndex((end) => end <= e.start);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(e.end); }
      else laneEnds[lane] = e.end;
      e.lane = lane;
    });
    cluster.forEach((e) => { e.lanes = laneEnds.length; out.push(e); });
    cluster = [];
  };

  sorted.forEach((e) => {
    if (cluster.length && e.start >= clusterEnd) flush();
    cluster.push(e);
    clusterEnd = cluster.length === 1 ? e.end : Math.max(clusterEnd, e.end);
  });
  if (cluster.length) flush();
  return out;
}

export default function TimetableGrid({
  entries, days, startHour, endHour, subtitleFor, overloadedFaculty,
  canAdd, onSlotClick, onEntryClick,
}) {
  const dayStartMin = startHour * 60;
  const bodyHeight = (endHour - startHour) * HOUR_PX;
  const pxPerMin = HOUR_PX / 60;

  // Bucket entries by day, parse times, lay out lanes.
  const byDay = useMemo(() => {
    const map = {};
    days.forEach((d) => { map[d] = []; });
    entries.forEach((e) => {
      const start = toMinutes(e.time_start);
      const end = toMinutes(e.time_end);
      if (start == null || end == null || !(e.day_of_week in map)) return;
      map[e.day_of_week].push({ ...e, start, end: Math.max(end, start + 20) });
    });
    Object.keys(map).forEach((d) => { map[d] = layoutDay(map[d]); });
    return map;
  }, [entries, days]);

  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const gridCols = `52px repeat(${days.length}, minmax(132px, 1fr))`;

  const handleColumnClick = (day, evt) => {
    if (!canAdd || !onSlotClick) return;
    const y = evt.clientY - evt.currentTarget.getBoundingClientRect().top;
    const hour = startHour + Math.floor(y / HOUR_PX);
    onSlotClick(day, hour);
  };

  return (
    <Box sx={{ overflow: 'auto', flex: 1 }}>
      <Box sx={{ minWidth: 52 + days.length * 132 }}>
        {/* Header row */}
        <Box sx={{
          display: 'grid', gridTemplateColumns: gridCols,
          position: 'sticky', top: 0, zIndex: 2, bgcolor: 'background.paper',
        }}>
          <Box />
          {days.map((d) => (
            <Box key={d} sx={{
              textAlign: 'center', py: 0.75, fontWeight: 700, fontSize: '0.78rem',
              color: 'text.secondary', letterSpacing: 0.5, borderBottom: '2px solid',
              borderColor: 'divider',
            }}>
              {DAY_LABELS[d] || d}
            </Box>
          ))}
        </Box>

        {/* Body */}
        <Box sx={{ display: 'grid', gridTemplateColumns: gridCols }}>
          {/* Time gutter */}
          <Box sx={{ position: 'relative', height: bodyHeight }}>
            {hours.map((h) => (
              <Typography key={h} sx={{
                position: 'absolute', top: Math.max((h - startHour) * HOUR_PX - 6, 1), right: 6,
                fontSize: '0.68rem', color: 'text.disabled',
              }}>
                {fmt(h * 60)}
              </Typography>
            ))}
          </Box>

          {/* Day columns */}
          {days.map((d) => (
            <Box
              key={d}
              onClick={(evt) => handleColumnClick(d, evt)}
              sx={{
                position: 'relative', height: bodyHeight,
                borderLeft: '1px solid', borderColor: 'divider',
                cursor: canAdd ? 'copy' : 'default',
                backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent ${HOUR_PX - 1}px, rgba(0,0,0,0.06) ${HOUR_PX - 1}px, rgba(0,0,0,0.06) ${HOUR_PX}px)`,
              }}
            >
              {byDay[d].map((e) => {
                const color = getColor(e.course);
                const top = (e.start - dayStartMin) * pxPerMin;
                const height = (e.end - e.start) * pxPerMin;
                const widthPct = 100 / e.lanes;
                const compact = height < 42;
                const overloaded = e.faculty != null && overloadedFaculty?.has(String(e.faculty));
                return (
                  <Tooltip
                    key={e.id}
                    title={`${e.course_code || ''} — ${e.course_title || ''} · ${fmt(e.start)}–${fmt(e.end)} · ${subtitleFor(e)}${overloaded ? ' · ⚠ faculty overloaded' : ''}`}
                    arrow
                  >
                    <Box
                      onClick={(evt) => { evt.stopPropagation(); onEntryClick?.(e); }}
                      sx={{
                        position: 'absolute',
                        top, height: Math.max(height - 2, 18),
                        left: `calc(${e.lane * widthPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        bgcolor: `${color}1f`,
                        borderLeft: `3px solid ${color}`,
                        borderRadius: '4px',
                        px: 0.6, py: compact ? 0.1 : 0.4,
                        overflow: 'hidden', cursor: onEntryClick ? 'pointer' : 'default',
                        ...(overloaded && {
                          boxShadow: '0 0 0 1.5px #ef4444 inset',
                          bgcolor: '#ef44441a',
                        }),
                        '&:hover': {
                          bgcolor: overloaded ? '#ef444433' : `${color}33`, zIndex: 1,
                          ...(onEntryClick && { boxShadow: `0 0 0 1.5px ${overloaded ? '#ef4444' : color} inset` }),
                        },
                      }}>
                      {overloaded && (
                        <Warning sx={{
                          position: 'absolute', top: 2, right: 2, fontSize: 13, color: '#ef4444',
                        }} />
                      )}
                      <Typography noWrap sx={{
                        fontSize: '0.7rem', fontWeight: 700, color, lineHeight: 1.2,
                        pr: overloaded ? 1.5 : 0,
                      }}>
                        {e.course_code || `Course ${e.course}`}
                      </Typography>
                      {!compact && (
                        <Typography noWrap sx={{ fontSize: '0.62rem', color: 'text.secondary', lineHeight: 1.25 }}>
                          {subtitleFor(e)}
                        </Typography>
                      )}
                      {height >= 58 && (
                        <Typography noWrap sx={{ fontSize: '0.58rem', color: 'text.disabled', lineHeight: 1.2 }}>
                          {fmt(e.start)}–{fmt(e.end)}
                        </Typography>
                      )}
                    </Box>
                  </Tooltip>
                );
              })}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
