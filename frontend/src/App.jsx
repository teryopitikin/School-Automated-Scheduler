import { CircularProgress, Box } from '@mui/material';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user) return <Login />;

  return (
    <Box sx={{ p: 4 }}>
      <p>Logged in as {user.username}. Layout coming next.</p>
    </Box>
  );
}
