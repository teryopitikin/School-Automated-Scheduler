import { Card, CardContent, Typography, Box } from '@mui/material';
import { FONT_MONO } from '../theme';

// Ledger-style stat: mono numeral (data is data), small-caps label,
// icon set in a quiet tinted tile.
export default function StatCard({ icon, label, value, color = 'primary.main', onClick }) {
  return (
    <Card
      onClick={onClick}
      sx={onClick ? {
        cursor: 'pointer',
        transition: 'border-color 120ms, transform 120ms',
        '&:hover': { borderColor: color, transform: 'translateY(-1px)' },
      } : undefined}
    >
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.75, py: '14px !important' }}>
        <Box sx={{
          color, width: 42, height: 42, borderRadius: '8px', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(237,243,238,0.06)' : 'rgba(20,52,43,0.05)',
        }}>
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{
            fontFamily: FONT_MONO, fontSize: '0.6rem', fontWeight: 600,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'text.secondary', mb: 0.25, whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {label}
          </Typography>
          <Typography sx={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: '1.35rem', lineHeight: 1.1 }}>
            {value}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}
