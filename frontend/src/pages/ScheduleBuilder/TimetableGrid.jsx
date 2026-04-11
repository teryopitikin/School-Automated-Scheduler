import { useMemo } from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { Star, Lock } from '@mui/icons-material';

const ENTRY_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6',
  '#eab308', '#6366f1', '#84cc16', '#06b6d4', '#f43f5e',
];

function getColor(courseId) {
  return ENTRY_COLORS[courseId % ENTRY_COLORS.length];
}

export default function TimetableGrid({
  schedules, days, hours, selectedCourse, suggestions, onSlotClick,
}) {
  const entryMap = useMemo(() => {
    const map = {};
    schedules.forEach((entry) => {
      const startHour = parseInt(entry.time_start?.split(':')[0], 10);
      const key = `${entry.day_of_week}-${startHour}`;
      if (!map[key]) map[key] = [];
      map[key].push(entry);
    });
    return map;
  }, [schedules]);

  const suggestionMap = useMemo(() => {
    const map = {};
    if (!suggestions) return map;
    suggestions.forEach((s, i) => {
      const startHour = parseInt(s.time_start?.split(':')[0], 10);
      const key = `${s.day_of_week}-${startHour}`;
      map[key] = { rank: i + 1, score: s.total_score, details: s.score_breakdown, suggestion: s };
    });
    return map;
  }, [suggestions]);

  return (
    <Box sx={{ overflowX: 'auto', flex: 1 }}>
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: `60px repeat(${days.length}, 1fr)`,
        gap: '2px', fontSize: '0.8rem', minWidth: 600,
      }}>
        {/* Header row */}
        <Box />
        {days.map((d) => (
          <Box key={d} sx={{ textAlign: 'center', py: 0.75, color: 'text.secondary', fontWeight: 600, fontSize: '0.75rem' }}>
            {d}
          </Box>
        ))}

        {/* Time rows */}
        {hours.map((h) => (
          <Box key={h} sx={{ display: 'contents' }}>
            {/* Time label */}
            <Box sx={{ py: 1, pr: 1, color: 'text.secondary', fontSize: '0.75rem', textAlign: 'right' }}>
              {`${h}:00`}
            </Box>

            {/* Day cells */}
            {days.map((d) => {
              const key = `${d}-${h}`;
              const entries = entryMap[key] || [];
              const sug = selectedCourse ? suggestionMap[key] : null;
              const hasEntry = entries.length > 0;
              const isConflict = selectedCourse && hasEntry && entries.some((e) => e.course !== selectedCourse.id);

              let cellSx = {
                p: 0.5, borderRadius: 1, minHeight: 48, cursor: 'pointer',
                border: '1px solid', borderColor: 'divider',
                bgcolor: 'background.paper',
                transition: 'all 0.15s',
                '&:hover': { bgcolor: selectedCourse ? 'primary.light' : 'action.hover' },
              };

              if (hasEntry) {
                const entry = entries[0];
                const color = getColor(entry.course);
                cellSx = {
                  ...cellSx,
                  bgcolor: `${color}15`,
                  borderColor: `${color}40`,
                  cursor: 'default',
                };
              } else if (selectedCourse && sug) {
                cellSx = {
                  ...cellSx,
                  borderColor: '#22c55e',
                  borderStyle: 'dashed',
                  borderWidth: 2,
                  bgcolor: '#f0fdf4',
                };
              } else if (selectedCourse && isConflict) {
                cellSx = {
                  ...cellSx,
                  bgcolor: '#fef2f2',
                  borderColor: '#ef4444',
                  cursor: 'not-allowed',
                };
              } else if (selectedCourse) {
                cellSx = {
                  ...cellSx,
                  borderStyle: 'dashed',
                  borderColor: '#22c55e80',
                  bgcolor: '#f0fdf480',
                };
              }

              return (
                <Box
                  key={key} sx={cellSx}
                  onClick={() => {
                    if (!hasEntry && selectedCourse) {
                      onSlotClick(d, h, sug?.suggestion);
                    }
                  }}
                >
                  {hasEntry ? (
                    entries.map((entry) => (
                      <Tooltip key={entry.id}
                        title={`${entry.course_code || ''} · ${entry.faculty_name || 'TBA'} · ${entry.room_name || ''}`}>
                        <Box sx={{ fontSize: '0.7rem' }}>
                          <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: getColor(entry.course) }}>
                            {entry.course_code || `Course ${entry.course}`}
                          </Typography>
                          <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>
                            {entry.room_name || ''} {entry.faculty_name ? `· ${entry.faculty_name}` : ''}
                          </Typography>
                        </Box>
                      </Tooltip>
                    ))
                  ) : sug ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
                      <Star sx={{ fontSize: 14, color: '#22c55e' }} />
                      <Typography sx={{ fontSize: '0.65rem', color: '#22c55e', fontWeight: 600 }}>
                        #{sug.rank}
                      </Typography>
                    </Box>
                  ) : isConflict ? (
                    <Lock sx={{ fontSize: 14, color: '#ef4444' }} />
                  ) : null}
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
