import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { EditorApp } from './EditorApp.jsx';
import '../styles.css';

// same renderer settings as the viewer, so the preview is the published look
THREE.ColorManagement.enabled = false;

createRoot(document.getElementById('root')).render(<EditorApp />);
