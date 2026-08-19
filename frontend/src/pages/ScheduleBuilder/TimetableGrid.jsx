import { useMemo, useRef, useState } from 'react';
import { Box, Typography, Tooltip, IconButton } from '@mui/material';
import { Warning, Add, Remove } from '@mui/icons-material';

const SNAP_MIN = 30;       // drag-and-drop snaps to half-hour boundaries

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
  canAdd, onSlotClick, onEntryClick, onEntryMove, addOnTaken = false,
}) {
  // Zoom via the +/- controls (bottom-right). 100%-300% vertical scale.
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef(null);

  const hourPx = HOUR_PX * zoom;
  const dayStartMin = startHour * 60;
  const bodyHeight = (endHour - startHour) * hourPx;
  const pxPerMin = hourPx / 60;

  // --- drag-and-drop ---
  const dragRef = useRef(null);                 // { entry, duration, grabOffsetMin }
  const [dropHint, setDropHint] = useState(null); // { day, start, end } preview

  const dropStartFor = (evt) => {
    const y = evt.clientY - evt.currentTarget.getBoundingClientRect().top;
    const drag = dragRef.current;
    const raw = dayStartMin + y / pxPerMin - (drag?.grabOffsetMin || 0);
    const snapped = Math.round(raw / SNAP_MIN) * SNAP_MIN;
    const latest = endHour * 60 - (drag?.duration || SNAP_MIN);
    return Math.min(Math.max(snapped, dayStartMin), latest);
  };

  const handleDragStart = (e, evt) => {
    const y = evt.clientY - evt.currentTarget.getBoundingClientRect().top;
    dragRef.current = {
      entry: e, duration: e.end - e.start, grabOffsetMin: y / pxPerMin,
    };
    evt.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (day, evt) => {
    if (!dragRef.current) return;
    evt.preventDefault();
    evt.dataTransfer.dropEffect = 'move';
    const start = dropStartFor(evt);
    setDropHint({ day, start, end: start + dragRef.current.duration });
  };

  const handleDrop = (day, evt) => {
    const drag = dragRef.current;
    if (!drag) return;
    evt.preventDefault();
    const start = dropStartFor(evt);
    setDropHint(null);
    dragRef.current = null;
    if (day !== drag.entry.day_of_week || start !== drag.entry.start) {
      onEntryMove?.(drag.entry, day, start, start + drag.duration);
    }
  };

  const handleDragEnd = () => { dragRef.current = null; setDropHint(null); };

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

  // Merged occupied intervals per day — rendered as gray bands behind the
  // cards so free time reads as plain background at a glance.
  const takenByDay = useMemo(() => {
    const map = {};
    Object.keys(byDay).forEach((d) => {
      const sorted = [...byDay[d]].sort((a, b) => a.start - b.start);
      const merged = [];
      sorted.forEach(({ start, end }) => {
        const last = merged[merged.length - 1];
        if (last && start <= last.end) last.end = Math.max(last.end, end);
        else merged.push({ start, end });
      });
      map[d] = merged;
    });
    return map;
  }, [byDay]);

  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const gridCols = `52px repeat(${days.length}, minmax(132px, 1fr))`;

  const handleColumnClick = (day, evt) => {
    if (!canAdd || !onSlotClick) return;
    const y = evt.clientY - evt.currentTarget.getBoundingClientRect().top;
    const clickedMin = dayStartMin + y / pxPerMin;
    const taken = takenByDay[day] || [];
    const inTaken = taken.some((iv) => clickedMin >= iv.start && clickedMin < iv.end);
    // Taken (grayed) slots can't be added to — only free time is clickable.
    // A slot occupied by a different program's class is never plottable; only
    // the single-program lens sets addOnTaken (its bands are its OWN classes,
    // and another of its sections may be free at that time).
    if (!addOnTaken && inTaken) return;
    const hour = startHour + Math.floor(y / hourPx);
    // Free window around the click, bounded by the neighbouring occupied
    // intervals — the dialog locks its times to it so the new class can't
    // overlap what's plotted around it. No window when clicking a busy band.
    let freeWindow = null;
    if (!inTaken) {
      let ws = dayStartMin;
      let we = endHour * 60;
      taken.forEach((iv) => {
        if (iv.end <= clickedMin) ws = Math.max(ws, iv.end);
        if (iv.start > clickedMin) we = Math.min(we, iv.start);
      });
      freeWindow = { start: ws, end: we };
    }
    onSlotClick(day, hour, freeWindow);
  };

  const ZOOM_STEPS = [1, 1.5, 2, 3];
  const zoomStep = (dir) => {
    const i = ZOOM_STEPS.indexOf(zoom);
    const next = ZOOM_STEPS[Math.min(Math.max(i + dir, 0), ZOOM_STEPS.length - 1)];
    if (next === zoom) return;
    const el = scrollRef.current;
    // keep whatever time is at the viewport centre in place after rescaling
    const centerMin = el ? dayStartMin + (el.scrollTop + el.clientHeight / 2) / pxPerMin : null;
    setZoom(next);
    requestAnimationFrame(() => {
      if (el && centerMin != null) {
        el.scrollTop = Math.max(
          (centerMin - dayStartMin) * (HOUR_PX * next) / 60 - el.clientHeight / 2, 0,
        );
      }
    });
  };

  return (
    <Box ref={scrollRef} sx={{ overflow: 'auto', flex: 1, position: 'relative' }}>
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
                position: 'absolute', top: Math.max((h - startHour) * hourPx - 6, 1), right: 6,
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
              onDragOver={(evt) => handleDragOver(d, evt)}
              onDragLeave={() => setDropHint((h) => (h?.day === d ? null : h))}
              onDrop={(evt) => handleDrop(d, evt)}
              sx={{
                position: 'relative', height: bodyHeight,
                borderLeft: '1px solid', borderColor: 'divider',
                cursor: canAdd ? 'copy' : 'default',
                backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent ${hourPx - 1}px, rgba(0,0,0,0.06) ${hourPx - 1}px, rgba(0,0,0,0.06) ${hourPx}px)`,
              }}
            >
              {takenByDay[d]?.map((iv, i) => (
                <Box key={`taken-${i}`} sx={{
                  position: 'absolute', left: 0, right: 0,
                  pointerEvents: canAdd && !addOnTaken ? 'auto' : 'none',
                  cursor: canAdd && !addOnTaken ? 'not-allowed' : undefined,
                  top: (iv.start - dayStartMin) * pxPerMin,
                  height: (iv.end - iv.start) * pxPerMin,
                  bgcolor: (t) => (t.palette.mode === 'dark'
                    ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)'),
                }} />
              ))}
              {dropHint?.day === d && (
                <Box sx={{
                  position: 'absolute', left: 2, right: 2, zIndex: 2, pointerEvents: 'none',
                  top: (dropHint.start - dayStartMin) * pxPerMin,
                  height: (dropHint.end - dropHint.start) * pxPerMin - 2,
                  border: '2px dashed #0d9488', borderRadius: '4px', bgcolor: '#0d948814',
                  display: 'flex', alignItems: 'flex-start', px: 0.6,
                }}>
                  <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#0d9488' }}>
                    {fmt(dropHint.start)}–{fmt(dropHint.end)}
                  </Typography>
                </Box>
              )}
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
                      draggable={!!onEntryMove}
                      onDragStart={(evt) => handleDragStart(e, evt)}
                      onDragEnd={handleDragEnd}
                      sx={{
                        position: 'absolute',
                        top, height: Math.max(height - 2, 18),
                        left: `calc(${e.lane * widthPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        bgcolor: `${color}1f`,
                        borderLeft: `3px solid ${color}`,
                        borderRadius: '4px',
                        px: 0.6, py: compact ? 0.1 : 0.4,
                        overflow: 'hidden',
                        cursor: onEntryMove ? 'grab' : (onEntryClick ? 'pointer' : 'default'),
                        '&:active': onEntryMove ? { cursor: 'grabbing' } : undefined,
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

      {/* Zoom controls — float at the bottom-right of the grid */}
      <Box sx={{
        position: 'sticky', bottom: 10, height: 0, display: 'flex',
        justifyContent: 'flex-end', pr: 1.5, pointerEvents: 'none', zIndex: 3,
      }}>
        <Box sx={{
          pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 0.25,
          transform: 'translateY(-100%)',
          bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
          borderRadius: 2, px: 0.5, py: 0.15, boxShadow: 2,
        }}>
          <IconButton size="small" onClick={() => zoomStep(-1)} disabled={zoom <= 1}
            title="Zoom out">
            <Remove sx={{ fontSize: 16 }} />
          </IconButton>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, width: 38, textAlign: 'center' }}>
            {Math.round(zoom * 100)}%
          </Typography>
          <IconButton size="small" onClick={() => zoomStep(1)} disabled={zoom >= 3}
            title="Zoom in">
            <Add sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
}
