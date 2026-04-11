import { Routes, Route } from 'react-router-dom';
import { CircularProgress, Box, Typography } from '@mui/material';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import AppLayout from './layouts/AppLayout';

function Placeholder({ title }) {
  return <Typography variant="h5">{title}</Typography>;
}

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
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Placeholder title="Dashboard" />} />
        <Route path="/academic-periods" element={<Placeholder title="Academic Periods" />} />
        <Route path="/programs" element={<Placeholder title="Programs & Sections" />} />
        <Route path="/departments" element={<Placeholder title="Departments" />} />
        <Route path="/courses" element={<Placeholder title="Courses" />} />
        <Route path="/faculty" element={<Placeholder title="Faculty" />} />
        <Route path="/rooms" element={<Placeholder title="Rooms" />} />
        <Route path="/schedule" element={<Placeholder title="Schedule Builder" />} />
        <Route path="/config" element={<Placeholder title="Configuration" />} />
        <Route path="/reports" element={<Placeholder title="Reports" />} />
        <Route path="/import-export" element={<Placeholder title="Import / Export" />} />
      </Route>
    </Routes>
  );
}
