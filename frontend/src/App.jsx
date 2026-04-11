import { Routes, Route } from 'react-router-dom';
import { CircularProgress, Box } from '@mui/material';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import AppLayout from './layouts/AppLayout';
import AcademicPeriods from './pages/AcademicPeriods';
import Programs from './pages/Programs';
import Departments from './pages/Departments';
import Courses from './pages/Courses';
import Faculty from './pages/Faculty';
import Rooms from './pages/Rooms';
import Dashboard from './pages/Dashboard';
import Configuration from './pages/Configuration';
import Reports from './pages/Reports';
import ImportExport from './pages/ImportExport';
import ScheduleBuilder from './pages/ScheduleBuilder';

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
        <Route path="/" element={<Dashboard />} />
        <Route path="/academic-periods" element={<AcademicPeriods />} />
        <Route path="/programs" element={<Programs />} />
        <Route path="/departments" element={<Departments />} />
        <Route path="/courses" element={<Courses />} />
        <Route path="/faculty" element={<Faculty />} />
        <Route path="/rooms" element={<Rooms />} />
        <Route path="/schedule" element={<ScheduleBuilder />} />
        <Route path="/config" element={<Configuration />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/import-export" element={<ImportExport />} />
      </Route>
    </Routes>
  );
}
