import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';

export default function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const ok = await login(username, password);
    setLoading(false);
    if (ok) {
      navigate('/');
    } else {
      setError('用户名或密码错误');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-dark-bg">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm p-8 rounded-lg border border-dark-border bg-dark-card space-y-6"
      >
        <h1 className="text-xl font-mono text-white text-center">SCADA 登录</h1>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-status-offline mb-1">用户名</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full h-9 px-3 rounded border border-dark-border bg-dark-bg text-sm text-white focus:outline-none focus:border-accent"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-xs text-status-offline mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-9 px-3 rounded border border-dark-border bg-dark-bg text-sm text-white focus:outline-none focus:border-accent"
              autoComplete="current-password"
            />
          </div>
        </div>
        {error && <div className="text-xs text-status-alarm text-center">{error}</div>}
        <button
          type="submit"
          disabled={loading}
          className="w-full h-9 rounded bg-accent text-dark-bg text-sm font-medium hover:bg-accent/90 disabled:opacity-50"
        >
          {loading ? '登录中...' : '登录'}
        </button>
      </form>
    </div>
  );
}
