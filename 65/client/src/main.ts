import { App } from './app';

const container = document.getElementById('game-container');
if (container) {
  const app = new App();
  app.init(container);
}
