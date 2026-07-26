import { Card, CardContent, Typography, Box } from '@mui/material';

export default function StatCard({ icon, label, value, color = 'primary.main', onClick }) {
  return (
    <Card
      onClick={onClick}
      sx={onClick ? {
        cursor: 'pointer',
        transition: 'box-shadow 120ms, transform 120ms',
        '&:hover': { boxShadow: 4, transform: 'translateY(-1px)' },
      } : undefined}
    >
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ color, fontSize: 40, display: 'flex' }}>{icon}</Box>
        <Box>
          <Typography variant="body2" color="text.secondary">{label}</Typography>
          <Typography variant="h5">{value}</Typography>
        </Box>
      </CardContent>
    </Card>
  );
}
