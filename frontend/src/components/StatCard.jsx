import { Card, CardContent, Typography, Box } from '@mui/material';

export default function StatCard({ icon, label, value, color = 'primary.main' }) {
  return (
    <Card>
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
