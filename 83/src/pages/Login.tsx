import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, User, Lock } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '../stores/auth.store';
import { cn } from '../lib/utils';

const loginSchema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
});

type LoginFormData = z.infer<typeof loginSchema>;

const Login: React.FC = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setError(null);
    setIsLoading(true);

    try {
      const result = await login(data as { username: string; password: string });
      if (result.success) {
        navigate('/');
      } else {
        setError(result.message || '登录失败');
      }
    } catch (e) {
      setError('网络错误，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary-800 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-paper-texture opacity-5" />
      <div className="absolute top-0 left-0 w-full h-1 bg-accent-500" />
      <div className="absolute bottom-0 left-0 w-full h-1 bg-accent-500" />
      
      <div className="absolute top-20 left-20 w-32 h-32 border border-accent-500/20 rounded-full" />
      <div className="absolute bottom-20 right-20 w-48 h-48 border border-accent-500/10 rounded-full" />
      <div className="absolute top-1/3 right-1/4 w-4 h-4 bg-accent-500/30 rounded-full animate-pulse" />
      <div className="absolute bottom-1/3 left-1/4 w-2 h-2 bg-accent-500/50 rounded-full animate-pulse" />

      <div className="relative w-full max-w-md animate-scroll-reveal">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-br from-primary-700 to-primary-900 px-8 py-12 text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-accent-500 flex items-center justify-center shadow-lg">
              <span className="font-serif text-3xl font-bold text-primary-900">拓</span>
            </div>
            <h1 className="font-serif text-2xl font-bold text-white tracking-wide">
              拓片数字化管理系统
            </h1>
            <p className="mt-2 text-primary-200 text-sm">Rubbing Digital Management System</p>
          </div>

          <div className="px-8 py-8">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-ink-600 mb-2">用户名</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-primary-400" />
                  </div>
                  <input
                    type="text"
                    {...register('username')}
                    className={cn(
                      'w-full pl-12 pr-4 py-3 border rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500',
                      errors.username ? 'border-red-300 bg-red-50' : 'border-primary-200 bg-paper'
                    )}
                    placeholder="请输入用户名"
                  />
                </div>
                {errors.username && (
                  <p className="mt-1 text-sm text-red-500">{errors.username.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-ink-600 mb-2">密码</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-primary-400" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    {...register('password')}
                    className={cn(
                      'w-full pl-12 pr-12 py-3 border rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500',
                      errors.password ? 'border-red-300 bg-red-50' : 'border-primary-200 bg-paper'
                    )}
                    placeholder="请输入密码"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-primary-400 hover:text-primary-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1 text-sm text-red-500">{errors.password.message}</p>
                )}
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm text-center">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-primary-700 hover:bg-primary-800 disabled:bg-primary-400 text-white font-medium rounded-lg transition-all duration-200 transform hover:shadow-lg active:scale-98 relative overflow-hidden group"
              >
                <span className="relative z-10">
                  {isLoading ? '登录中...' : '登 录'}
                </span>
                <div className="absolute inset-0 bg-accent-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-primary-100">
              <p className="text-center text-xs text-ink-400">
                登录即表示您同意我们的服务条款和隐私政策
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center text-primary-200 text-sm">
          <p>默认测试账号：admin / admin123</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
