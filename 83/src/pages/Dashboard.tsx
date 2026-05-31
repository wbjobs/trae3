import React, { useState, useEffect } from 'react';
import { Upload, FileEdit, Search, CheckCircle, Clock, XCircle, FileText, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api.service';
import { RubbingMetadata } from '../../shared/types';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    total: 0,
    published: 0,
    pending: 0,
    draft: 0,
  });
  const [recentItems, setRecentItems] = useState<RubbingMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [allData, pendingData, draftData, publishedData] = await Promise.all([
          apiService.getRubbings(1, 5),
          apiService.getRubbings(1, 100, 'pending'),
          apiService.getRubbings(1, 100, 'draft'),
          apiService.getRubbings(1, 100, 'published'),
        ]);

        setStats({
          total: allData.total,
          published: publishedData.total,
          pending: pendingData.total,
          draft: draftData.total,
        });
        setRecentItems(allData.items);
      } catch (e) {
        console.error('Load dashboard data failed:', e);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const quickActions = [
    {
      icon: Upload,
      title: '拓片上传',
      description: '上传新的拓片图像文件',
      path: '/upload',
      color: 'bg-blue-500',
      hoverColor: 'hover:bg-blue-600',
    },
    {
      icon: FileEdit,
      title: '著录编辑',
      description: '编辑拓片元数据信息',
      path: '/catalog/list',
      color: 'bg-primary-600',
      hoverColor: 'hover:bg-primary-700',
    },
    {
      icon: Search,
      title: '检索查询',
      description: '检索已发布的拓片数据',
      path: '/search',
      color: 'bg-accent-600',
      hoverColor: 'hover:bg-accent-700',
    },
  ];

  const statCards = [
    { label: '总记录数', value: stats.total, icon: FileText, color: 'text-primary-600', bg: 'bg-primary-50' },
    { label: '已发布', value: stats.published, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
    { label: '待审核', value: stats.pending, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { label: '草稿', value: stats.draft, icon: XCircle, color: 'text-ink-500', bg: 'bg-ink-50' },
  ];

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-ink-100 text-ink-600',
      pending: 'bg-yellow-100 text-yellow-700',
      published: 'bg-green-100 text-green-700',
    };
    const labels: Record<string, string> = {
      draft: '草稿',
      pending: '待审核',
      published: '已发布',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.draft}`}>
        {labels[status] || status}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-pulse text-primary-600">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-scroll-reveal">
      <div>
        <h1 className="font-serif text-3xl font-bold text-primary-800">系统概览</h1>
        <p className="mt-1 text-ink-500">欢迎使用拓片数字化管理系统</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {quickActions.map((action) => (
          <button
            key={action.path}
            onClick={() => navigate(action.path)}
            className={`p-6 bg-white rounded-xl shadow-paper border border-primary-100 text-left transition-all duration-300 hover:shadow-ink hover:-translate-y-1 group`}
          >
            <div className={`w-12 h-12 rounded-lg ${action.color} ${action.hoverColor} flex items-center justify-center transition-colors`}>
              <action.icon className="w-6 h-6 text-white" />
            </div>
            <h3 className="mt-4 font-serif text-lg font-semibold text-primary-800 group-hover:text-primary-600 transition-colors">
              {action.title}
            </h3>
            <p className="mt-1 text-sm text-ink-500">{action.description}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <div
            key={stat.label}
            className="p-5 bg-white rounded-xl shadow-paper border border-primary-100 animate-scroll-reveal"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-ink-500">{stat.label}</p>
                <p className="mt-1 font-serif text-3xl font-bold text-primary-800">
                  {stat.value}
                </p>
              </div>
              <div className={`w-12 h-12 rounded-lg ${stat.bg} flex items-center justify-center`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-paper border border-primary-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-primary-100 flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-primary-800">最近记录</h2>
          <button
            onClick={() => navigate('/catalog/list')}
            className="text-sm text-accent-600 hover:text-accent-700 transition-colors"
          >
            查看全部 →
          </button>
        </div>
        <div className="divide-y divide-primary-50">
          {recentItems.length === 0 ? (
            <div className="px-6 py-12 text-center text-ink-400">
              暂无记录，点击上方"拓片上传"开始录入
            </div>
          ) : (
            recentItems.map((item) => (
              <div
                key={item.id}
                className="px-6 py-4 hover:bg-primary-50/50 transition-colors cursor-pointer"
                onClick={() => navigate(`/catalog/${item.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-primary-600" />
                    </div>
                    <div>
                      <h3 className="font-medium text-primary-800">{item.title}</h3>
                      <p className="text-sm text-ink-500">
                        编号：{item.accessionNo} | {item.dynasty || '未知朝代'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {getStatusBadge(item.status)}
                    <span className="text-sm text-ink-400">
                      {new Date(item.createdAt).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
