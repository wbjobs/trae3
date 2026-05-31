import { FAULT_TYPE_LABELS } from '../../../shared/types';

interface Props {
  startDate: string;
  endDate: string;
  status: string;
  faultType: string;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  onFaultTypeChange: (v: string) => void;
}

export default function FilterBar(props: Props) {
  const inputClass = "bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm text-white focus:border-thermal-orange focus:outline-none transition-colors";

  return (
    <div className="flex gap-3 flex-wrap">
      <input
        type="date"
        value={props.startDate}
        onChange={(e) => props.onStartDateChange(e.target.value)}
        className={inputClass}
      />
      <input
        type="date"
        value={props.endDate}
        onChange={(e) => props.onEndDateChange(e.target.value)}
        className={inputClass}
      />
      <select
        value={props.status}
        onChange={(e) => props.onStatusChange(e.target.value)}
        className={inputClass}
      >
        <option value="">全部状态</option>
        <option value="processing">处理中</option>
        <option value="completed">已完成</option>
        <option value="failed">失败</option>
      </select>
      <select
        value={props.faultType}
        onChange={(e) => props.onFaultTypeChange(e.target.value)}
        className={inputClass}
      >
        <option value="">全部类型</option>
        {Object.entries(FAULT_TYPE_LABELS).map(([key, label]) => (
          <option key={key} value={key}>{label}</option>
        ))}
      </select>
    </div>
  );
}
