import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Card,
  Form,
  Input,
  Select,
  Button,
  Progress,
  List,
  Tag,
  message,
  Space,
  Divider
} from 'antd';
import {
  Upload,
  File,
  CheckCircle,
  XCircle,
  Loader,
  Send,
  RefreshCw
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '../store/appStore';
import { coordinateSystems, scales } from '../data/mockData';
import type { FileType } from '../../shared/types';

const { TextArea } = Input;
const { Option } = Select;

const UploadPage = () => {
  const [form] = Form.useForm();
  const { uploadTasks, addUploadTask, updateUploadTask, addArchive, user } = useAppStore();
  const [uploading, setUploading] = useState(false);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toUpperCase();
    switch (ext) {
      case 'DWG':
        return <span className="text-blue-500 font-bold text-sm">DWG</span>;
      case 'SHP':
        return <span className="text-green-500 font-bold text-sm">SHP</span>;
      case 'TIF':
        return <span className="text-orange-500 font-bold text-sm">TIF</span>;
      case 'GDB':
        return <span className="text-purple-500 font-bold text-sm">GDB</span>;
      default:
        return <File size={20} className="text-gray-500" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return <CheckCircle size={18} className="text-green-500" />;
      case 'FAILED':
        return <XCircle size={18} className="text-red-500" />;
      case 'UPLOADING':
      case 'VALIDATING':
        return <Loader size={18} className="text-blue-500 animate-spin" />;
      default:
        return null;
    }
  };

  const simulateUpload = useCallback((taskId: string) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        updateUploadTask(taskId, { progress: 100, status: 'VALIDATING' });
        
        setTimeout(() => {
          updateUploadTask(taskId, { progress: 100, status: 'SUCCESS' });
          message.success('文件上传并校验成功！');
        }, 1500);
      } else {
        updateUploadTask(taskId, { progress, status: 'UPLOADING' });
      }
    }, 300);
  }, [updateUploadTask]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      const taskId = uuidv4();
      const ext = file.name.split('.').pop()?.toUpperCase() || 'OTHER';
      const validTypes = ['DWG', 'SHP', 'GDB', 'TIF'];
      const fileType = (validTypes.includes(ext) ? ext : 'OTHER') as FileType;

      addUploadTask({
        id: taskId,
        fileName: file.name,
        fileSize: file.size,
        progress: 0,
        status: 'PENDING'
      });

      simulateUpload(taskId);
    });
  }, [addUploadTask, simulateUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/octet-stream': ['.dwg', '.shp', '.gdb', '.tif', '.tiff']
    },
    multiple: true
  });

  const handleSubmit = async (values: any) => {
    const successfulTasks = uploadTasks.filter(t => t.status === 'SUCCESS');
    if (successfulTasks.length === 0) {
      message.error('请先上传至少一个文件');
      return;
    }

    setUploading(true);
    
    setTimeout(() => {
      successfulTasks.forEach((task) => {
        const ext = task.fileName.split('.').pop()?.toUpperCase() || 'OTHER';
        const validTypes = ['DWG', 'SHP', 'GDB', 'TIF'];
        const fileType = (validTypes.includes(ext) ? ext : 'OTHER') as FileType;
        const tempArchiveId = uuidv4();
        const timestamp = Date.now();

        addArchive({
          id: tempArchiveId,
          projectName: values.projectName,
          coordinateSystem: values.coordinateSystem,
          scale: values.scale,
          surveyArea: values.surveyArea,
          fileType,
          fileSize: task.fileSize,
          fileName: task.fileName,
          filePath: `/storage/archives/${tempArchiveId}_${task.fileName}_${timestamp}`,
          uploader: user?.name || '未知',
          uploadTime: new Date().toLocaleString(),
          status: 'PENDING',
          version: 1
        });
      });

      setUploading(false);
      message.success('成果提交成功，已进入质检队列！');
      form.resetFields();
    }, 1000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 m-0">成果上传</h2>
          <p className="text-gray-500 mt-1 m-0">上传测绘成果文件并填写元数据</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-300 ${
                isDragActive
                  ? 'border-blue-500 bg-blue-50 scale-102'
                  : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
              }`}
            >
              <input {...getInputProps()} />
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Upload size={32} className="text-blue-600" />
              </div>
              <p className="text-lg font-medium text-gray-700 mb-2">
                {isDragActive ? '释放文件以上传' : '拖拽文件到此处，或点击选择'}
              </p>
              <p className="text-sm text-gray-500">
                支持 DWG、SHP、GDB、TIF 等测绘格式，单文件最大 2GB
              </p>
            </div>
          </Card>

          {uploadTasks.length > 0 && (
            <Card title="上传列表" className="shadow-sm">
              <List
                dataSource={uploadTasks}
                renderItem={(task) => (
                  <List.Item className="px-0">
                    <div className="flex items-center w-full gap-4">
                      <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                        {getFileIcon(task.fileName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-gray-800 truncate">
                            {task.fileName}
                          </span>
                          <Space>
                            <Tag color={
                              task.status === 'SUCCESS' ? 'green' :
                              task.status === 'FAILED' ? 'red' :
                              task.status === 'VALIDATING' ? 'cyan' : 'blue'
                            }>
                              {task.status === 'SUCCESS' ? '校验通过' :
                               task.status === 'FAILED' ? '上传失败' :
                               task.status === 'VALIDATING' ? '格式校验中' :
                               task.status === 'UPLOADING' ? '上传中' : '等待中'}
                            </Tag>
                            {getStatusIcon(task.status)}
                          </Space>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-500">
                            {formatFileSize(task.fileSize)}
                          </span>
                          <Progress
                            percent={Math.round(task.progress)}
                            size="small"
                            className="flex-1 min-w-32"
                          />
                        </div>
                      </div>
                      {task.status === 'FAILED' && (
                        <Button 
                          type="text" 
                          size="small" 
                          icon={<RefreshCw size={16} />}
                        >
                          重试
                        </Button>
                      )}
                    </div>
                  </List.Item>
                )}
              />
            </Card>
          )}
        </div>

        <div className="lg:col-span-1">
          <Card 
            title="元数据填写" 
            className="shadow-sm sticky top-6"
            extra={
              <Button 
                type="primary" 
                icon={<Send size={16} />}
                onClick={form.submit}
                loading={uploading}
              >
                提交成果
              </Button>
            }
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              initialValues={{
                coordinateSystem: 'CGCS2000',
                scale: '1:500'
              }}
            >
              <Form.Item
                name="projectName"
                label="项目名称"
                rules={[{ required: true, message: '请输入项目名称' }]}
              >
                <Input placeholder="请输入项目名称" size="large" />
              </Form.Item>

              <Form.Item
                name="coordinateSystem"
                label="坐标系"
                rules={[{ required: true, message: '请选择坐标系' }]}
              >
                <Select size="large" placeholder="请选择坐标系">
                  {coordinateSystems.map((sys) => (
                    <Option key={sys} value={sys}>{sys}</Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                name="scale"
                label="比例尺"
                rules={[{ required: true, message: '请选择比例尺' }]}
              >
                <Select size="large" placeholder="请选择比例尺">
                  {scales.map((scale) => (
                    <Option key={scale} value={scale}>{scale}</Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                name="surveyArea"
                label="测区范围"
                rules={[{ required: true, message: '请输入测区范围' }]}
              >
                <Input placeholder="例如：北京市朝阳区" size="large" />
              </Form.Item>

              <Form.Item name="description" label="成果说明">
                <TextArea rows={4} placeholder="请填写成果说明（选填）" />
              </Form.Item>

              <Divider />

              <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-blue-800 mb-2">上传须知</h4>
                <ul className="text-xs text-blue-600 space-y-1 pl-4">
                  <li>请确保文件格式符合规范要求</li>
                  <li>元数据信息将用于档案检索</li>
                  <li>提交后将进入质检流程</li>
                </ul>
              </div>
            </Form>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default UploadPage;
