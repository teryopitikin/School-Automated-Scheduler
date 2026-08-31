import { Box, Typography, Button } from '@mui/material';
import { Add } from '@mui/icons-material';
import { FONT_MONO } from '../theme';

export default function PageHeader({ title, eyebrow = 'Scheduler', buttonLabel, onButtonClick }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 2.5 }}>
      <Box>
        <Typography sx={{
          fontFamily: FONT_MONO, fontSize: '0.62rem', fontWeight: 600,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'secondary.dark', mb: 0.25,
        }}>
          {eyebrow}
        </Typography>
        <Typography variant="h5">{title}</Typography>
      </Box>
      {buttonLabel && (
        <Button variant="contained" startIcon={<Add />} onClick={onButtonClick}>
          {buttonLabel}
        </Button>
      )}
    </Box>
  );
}
