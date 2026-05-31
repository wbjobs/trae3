-- CreateIndex
CREATE INDEX "Alert_level_status_idx" ON "Alert"("level", "status");

-- CreateIndex
CREATE INDEX "Alert_status_createdAt_idx" ON "Alert"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_deviceId_createdAt_idx" ON "Alert"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "Device_areaId_status_idx" ON "Device"("areaId", "status");

-- CreateIndex
CREATE INDEX "Device_status_lastOnline_idx" ON "Device"("status", "lastOnline");

-- CreateIndex
CREATE INDEX "MeterData_deviceId_timestamp_flowRate_idx" ON "MeterData"("deviceId", "timestamp", "flowRate");

-- CreateIndex
CREATE INDEX "MeterData_timestamp_deviceId_totalConsumption_idx" ON "MeterData"("timestamp", "deviceId", "totalConsumption");
