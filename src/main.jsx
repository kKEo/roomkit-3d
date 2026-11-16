import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { App } from './App.jsx';
import { stillFrom } from './lib/still.js';
import { trackLoading } from './ui/stillRig.js';
import './styles.css';

// The look is tuned for raw (non colour-managed) output, as in the original prototype.
THREE.ColorManagement.enabled = false;

// `?still`: a camera on a tripod for scripted pictures (src/lib/still.js)
const still = stillFrom(location.search);
if (still) { document.documentElement.dataset.still = ''; trackLoading(); }

createRoot(document.getElementById('root')).render(<App still={still} />);
