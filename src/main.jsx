import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { App } from './App.jsx';
import './styles.css';

// The look is tuned for raw (non colour-managed) output, as in the original prototype.
THREE.ColorManagement.enabled = false;

createRoot(document.getElementById('root')).render(<App />);
