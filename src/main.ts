import { Engine } from './Engine';

const engine = new Engine();
(window as any).__engine = engine;
engine.start();
