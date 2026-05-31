const WebSocket = require('ws');
const mqtt = require('mqtt');

class SignalSubscriber {
  constructor(engine) {
    this.engine = engine;
    this.gatewayWsUrl = `ws://localhost:${process.env.GATEWAY_PORT || 3000}`;
    this.mqttBrokerUrl = process.env.MQTT_BROKER_URL;
    this.wsClient = null;
    this.mqttClient = null;
    this.reconnectInterval = 5000;
  }

  async connectWebSocket() {
    return new Promise((resolve, reject) => {
      try {
        this.wsClient = new WebSocket(this.gatewayWsUrl);

        this.wsClient.on('open', () => {
          console.log('Strategy WebSocket connected to gateway');
          resolve(true);
        });

        this.wsClient.on('message', async (data) => {
          try {
            const message = JSON.parse(data.toString());
            if (message.type === 'signal_update') {
              await this.engine.processBatchSignalData(message.payload);
            }
          } catch (err) {
            console.error('WebSocket message error:', err);
          }
        });

        this.wsClient.on('close', () => {
          console.log('Strategy WebSocket disconnected, reconnecting...');
          setTimeout(() => this.connectWebSocket(), this.reconnectInterval);
        });

        this.wsClient.on('error', (err) => {
          console.error('Strategy WebSocket error:', err.message);
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  async connectMqtt() {
    return new Promise((resolve) => {
      try {
        if (!this.mqttBrokerUrl) {
          resolve(false);
          return;
        }

        this.mqttClient = mqtt.connect(this.mqttBrokerUrl);

        this.mqttClient.on('connect', () => {
          console.log('Strategy MQTT connected');
          this.mqttClient.subscribe('industrial/devices/+/signal', (err) => {
            if (err) {
              console.warn('MQTT subscription failed:', err);
            } else {
              console.log('Subscribed to MQTT signal topics');
            }
          });
          resolve(true);
        });

        this.mqttClient.on('message', async (topic, message) => {
          try {
            const signalData = JSON.parse(message.toString());
            await this.engine.processSignalData(signalData);
          } catch (err) {
            console.error('MQTT message error:', err);
          }
        });

        this.mqttClient.on('error', (err) => {
          console.warn('MQTT error:', err.message);
          resolve(false);
        });
      } catch (err) {
        console.warn('MQTT connection failed:', err.message);
        resolve(false);
      }
    });
  }

  async start() {
    try {
      await Promise.allSettled([
        this.connectWebSocket(),
        this.connectMqtt()
      ]);
    } catch (err) {
      console.error('Signal subscriber start error:', err);
    }
  }

  close() {
    if (this.wsClient) {
      this.wsClient.close();
    }
    if (this.mqttClient) {
      this.mqttClient.end();
    }
  }
}

module.exports = SignalSubscriber;
