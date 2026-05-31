import React from 'react';
import { BarChart3, FileDown } from 'lucide-react';

export default function Reports() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-800">统计报表</h2>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
            <FileDown className="w-4 h-4" />
            导出报表
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="p-6 bg-gray-50 rounded-xl">
            <h3 className="text-sm font-medium text-gray-500 mb-2">本月用水量</h3>
            <p className="text-3xl font-bold text-gray-800">12,456.78 m³</p>
            <p className="text-sm text-green-500 mt-2">↑ 8.2% 较上月</p>
          </div>
          <div className="p-6 bg-gray-50 rounded-xl">
            <h3 className="text-sm font-medium text-gray-500 mb-2">设备在线率</h3>
            <p className="text-3xl font-bold text-gray-800">94.5%</p>
            <p className="text-sm text-green-500 mt-2">↑ 2.1% 较上月</p>
          </div>
          <div className="p-6 bg-gray-50 rounded-xl">
            <h3 className="text-sm font-medium text-gray-500 mb-2">告警处理率</h3>
            <p className="text-3xl font-bold text-gray-800">87.3%</p>
            <p className="text-sm text-red-500 mt-2">↓ 3.5% 较上月</p>
          </div>
          <div className="p-6 bg-gray-50 rounded-xl">
            <h3 className="text-sm font-medium text-gray-500 mb-2">平均响应时间</h3>
            <p className="text-3xl font-bold text-gray-800">2.3 小时</p>
            <p className="text-sm text-green-500 mt-2">↓ 15.2% 较上月</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">报表功能开发中...</h3>
        <p className="text-gray-500">
          统计报表功能正在开发中，敬请期待。将支持：
        </p>
        <ul className="mt-4 space-y-2 text-gray-600">
          <li>• 区域用水量统计与对比</li>
          <li>• 设备运行状态分析报告</li>
          <li>• 告警趋势分析</li>
          <li>• 自定义时间段报表导出</li>
        </ul>
      </div>
    </div>
  );
}
