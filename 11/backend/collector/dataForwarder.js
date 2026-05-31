const axios = require('axios');
const mqtt = require('mqtt');
const dotenv = require('dotenv');

const envFile = process.env.NODE_ENV === 'production' 
  ? '.env.production' 
  : '.env.development';

dotenv.config({ path: envFile });

class DataForwarder {
  constructor() {
    this.gatewayUrl = `http://localhost:${process.env.GATEWAY_PORT || 3000}`;
    this.mqttClient = null;
    this.useMqtt = false;
  }

  async initMqtt() {
    return new Promise((resolve) => {
      try {
        this.mqttClient = mqtt.connect(process.env.MQTT_BROKER_URL);
        this.mqttClient.on('connect', () => {
          console.log('Connected to MQTT broker');
          this.useMqtt = true;
          resolve(true);
        });
        this.mqttClient.on('error', (err) => {
          console.warn('MQTT connection failed, falling back to HTTP:', err.message);
          this.useMqtt = false;
          resolve(false);
        });
      } catch (err) {
        console.warn('MQTT initialization failed, using HTTP:', err.message);
        this.useMqtt = false;
        resolve(false);
      }
    });
  }

  async forwardViaHttp(data) {
    try {
      await axios.post(`${this.gatewayUrl}/api/signal/data`, {
        data: Array.isArray(data) ? data : [data]
      });
      return true;
    } catch (err) {
      console.error('HTTP forward error:', err.message);
      return false;
    }
  }

  async forwardViaMqtt(data) {
    if (!this.useMqtt || !this.mqttClient) {
      return this.forwardViaHttp(data);
    }

    try {
      const dataArray = Array.isArray(data) ? data : [data];
      for (const item of dataArray) {
        const topic = `industrial/devices/${item.device_id}/signal`;
        this.mqttClient.publish(topic, JSON.stringify(item));
      }
      return true;
    } catch (err) {
      console.error('MQTT forward error:', err.message);
      return this.forwardViaHttp(data);
    }
  }

  async forward(data) {
    if (this.useMqtt) {
      return this.forwardViaMqtt(data);
    } else {
      return this.forwardViaHttp(data);
    }
  }

  close() {
    if (this.mqttClient) {
      this.mqttClient.end();
    }
  }
}

module.exports = DataForwarder;
