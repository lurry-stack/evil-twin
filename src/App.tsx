import { useEffect } from 'react';
import { RouterProvider, useRouter } from './lib/router';
import { AuthProvider, useAuth } from './lib/auth';
import { ToastProvider } from './lib/toast';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { HomePage } from './pages/HomePage';
import { VipPage } from './pages/VipPage';
import { TeamPage } from './pages/TeamPage';
import { ProfilePage } from './pages/ProfilePage';
import { DepositPage } from './pages/DepositPage';
import { WithdrawPage } from './pages/WithdrawPage';
import { RecordsPage } from './pages/RecordsPage';
import { AboutPage, RegulationPage, SupportPage } from './pages/InfoPages';
import { TasksPage } from './pages/TasksPage';
import { CheckinPage } from './pages/CheckinPage';
import { RedeemPage, ChangePasswordPage, MyProductsPage } from './pages/SecondaryPages';
import { AdminPage } from './pages/AdminPage';

function Routes() {
  const { path, navigate } = useRouter();
  const { profile, loading } = useAuth();

  const publicRoutes = ['/login', '/register'];
  const isPublic = publicRoutes.includes(path);

  useEffect(() => {
    if (!loading && !profile && !isPublic) {
      navigate('/login', { replace: true });
    }
    if (!loading && profile && isPublic) {
      navigate('/home', { replace: true });
    }
  }, [loading, profile, isPublic, navigate]);

  if (loading && !isPublic) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  switch (path) {
    case '/login':
      return <LoginPage />;
    case '/register':
      return <RegisterPage />;
    case '/home':
      return <HomePage />;
    case '/vip':
      return <VipPage />;
    case '/team':
      return <TeamPage />;
    case '/profile':
      return <ProfilePage />;
    case '/deposit':
      return <DepositPage />;
    case '/withdraw':
      return <WithdrawPage />;
    case '/records':
      return <RecordsPage />;
    case '/about':
      return <AboutPage />;
    case '/regulation':
      return <RegulationPage />;
    case '/support':
      return <SupportPage />;
    case '/tasks':
      return <TasksPage />;
    case '/checkin':
      return <CheckinPage />;
    case '/redeem':
      return <RedeemPage />;
    case '/change-password':
      return <ChangePasswordPage />;
    case '/my-products':
      return <MyProductsPage />;
    case '/admin':
      return <AdminPage />;
    default:
      return <HomePage />;
  }
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <RouterProvider>
          <Routes />
        </RouterProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
