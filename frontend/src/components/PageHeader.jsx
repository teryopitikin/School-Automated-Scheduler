import { Box, Typography, Button } from '@mui/material';
import { Add } from '@mui/icons-material';

export default function PageHeader({ title, buttonLabel, onButtonClick }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
      <Typography variant="h5">{title}</Typography>
      {buttonLabel && (
        <Button variant="contained" startIcon={<Add />} onClick={onButtonClick}>
          {buttonLabel}
        </Button>
      )}
    </Box>
  );
}
