import { Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import RequireAuth from './components/RequireAuth';
import Account from './pages/Account';
import Home from './pages/Home';
import Login from './pages/Login';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <>
      <Header />
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login mode="login" />} />
          <Route path="/signup" element={<Login mode="signup" />} />
          <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
          {/* TODO(domain): add routes; wrap pages that need a user in <RequireAuth> */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="footer">__APP_NAME__</footer>
    </>
  );
}
