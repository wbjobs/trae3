CREATE DATABASE IF NOT EXISTS `train_status` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `train_status`;

DROP TABLE IF EXISTS `train_status`;

CREATE TABLE `train_status` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `train_id` varchar(32) NOT NULL COMMENT '列车编号',
  `line_id` varchar(16) DEFAULT NULL COMMENT '线路编号',
  `status` tinyint DEFAULT NULL COMMENT '列车状态:0正常1预警2故障3离线',
  `speed` decimal(8,2) DEFAULT NULL COMMENT '速度 km/h',
  `longitude` decimal(10,6) DEFAULT NULL COMMENT '经度',
  `latitude` decimal(10,6) DEFAULT NULL COMMENT '纬度',
  `next_station_id` int DEFAULT NULL COMMENT '下一站ID',
  `next_station_name` varchar(64) DEFAULT NULL COMMENT '下一站名称',
  `passenger_count` int DEFAULT NULL COMMENT '乘客数量',
  `door_status` decimal(5,2) DEFAULT NULL COMMENT '车门状态:0关闭1打开',
  `brake_status` tinyint DEFAULT NULL COMMENT '制动状态:0释放1制动',
  `power_status` tinyint DEFAULT NULL COMMENT '供电状态:0正常1故障',
  `communication_status` tinyint DEFAULT NULL COMMENT '通信状态:0正常1中断',
  `device_states` text COMMENT '设备状态JSON',
  `alert_codes` varchar(256) DEFAULT NULL COMMENT '告警代码列表',
  `raw_data` text COMMENT '原始数据',
  `protocol_version` varchar(16) DEFAULT NULL COMMENT '协议版本',
  `report_time` datetime NOT NULL COMMENT '上报时间',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `node_id` varchar(64) DEFAULT NULL COMMENT '处理节点ID',
  PRIMARY KEY (`id`),
  KEY `idx_train_id` (`train_id`),
  KEY `idx_report_time` (`report_time`),
  KEY `idx_line_id` (`line_id`),
  KEY `idx_status` (`status`),
  KEY `idx_train_report` (`train_id`,`report_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='列车状态历史表';

CREATE TABLE IF NOT EXISTS `train_status`.`sys_user` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `username` varchar(64) NOT NULL COMMENT '用户名',
  `password` varchar(128) NOT NULL COMMENT '密码',
  `role` varchar(32) DEFAULT 'USER' COMMENT '角色',
  `status` tinyint DEFAULT 1 COMMENT '状态:1启用0禁用',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统用户表';

INSERT INTO `train_status`.`sys_user` (`username`, `password`, `role`) VALUES
('admin', 'admin123', 'ADMIN');
