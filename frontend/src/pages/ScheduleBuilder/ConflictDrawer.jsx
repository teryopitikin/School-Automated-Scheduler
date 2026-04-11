import {
  Drawer, Box, Typography, List, ListItem, ListItemIcon, ListItemText,
  IconButton, Chip, Divider,
} from '@mui/material';
import { Close, Warning, ErrorOutline } from '@mui/icons-material';

export default function ConflictDrawer({ open, onClose, conflicts }) {
  return (
    <Drawer anchor="right" open={open} onClose={onClose}
      PaperProps={{ sx: { width: 360 } }}>
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Conflicts ({conflicts.length})</Typography>
          <IconButton onClick={onClose}><Close /></IconButton>
        </Box>
        <Divider sx={{ mb: 1 }} />
        {conflicts.length === 0 ? (
          <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
            No conflicts found.
          </Typography>
        ) : (
          <List dense>
            {conflicts.map((c, i) => (
              <ListItem key={i} sx={{ alignItems: 'flex-start', mb: 1 }}>
                <ListItemIcon sx={{ mt: 0.5 }}>
                  {c.severity === 'warning'
                    ? <Warning color="warning" fontSize="small" />
                    : <ErrorOutline color="error" fontSize="small" />
                  }
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {c.type || 'Conflict'}
                      </Typography>
                      <Chip label={c.severity || 'error'} size="small"
                        color={c.severity === 'warning' ? 'warning' : 'error'} />
                    </Box>
                  }
                  secondary={c.message || c.details || JSON.stringify(c)}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </Drawer>
  );
}
