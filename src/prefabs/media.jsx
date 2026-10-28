import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { useWorld } from '../scene/core.jsx';

/** Scale/offset a texture so it covers a w×h plane without stretching. */
function cover(texture, w, h) {
  const img = texture.image;
  const iw = img?.videoWidth || img?.width, ih = img?.videoHeight || img?.height;
  if (!iw || !ih) return;
  const planeAspect = w / h, imgAspect = iw / ih;
  if (imgAspect > planeAspect) { texture.repeat.set(planeAspect / imgAspect, 1); texture.offset.set((1 - texture.repeat.x) / 2, 0); }
  else { texture.repeat.set(1, imgAspect / planeAspect); texture.offset.set(0, (1 - texture.repeat.y) / 2); }
  texture.needsUpdate = true;
}

/** Loads an image or (muted, looping) video texture; null until ready or on failure. */
function useMediaTexture(source, src, w, h) {
  const [texture, setTexture] = useState(null);
  useEffect(() => {
    if (!src || (source !== 'image' && source !== 'video')) return;
    let tex = null, cancelled = false, video = null;
    const ready = t => { if (cancelled) { t.dispose(); return; } cover(t, w, h); tex = t; setTexture(t); };
    if (source === 'image') {
      new THREE.TextureLoader().load(src, ready, undefined, () => console.warn(`Could not load image ${src}`));
    } else {
      video = Object.assign(document.createElement('video'), { src, muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous' });
      video.addEventListener('loadeddata', () => ready(new THREE.VideoTexture(video)), { once: true });
      video.addEventListener('error', () => console.warn(`Could not load video ${src}`), { once: true });
      video.play().catch(() => {});
    }
    return () => {
      cancelled = true;
      tex?.dispose();
      if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
      setTexture(null);
    };
  }, [source, src, w, h]);
  return texture;
}

/**
 * A w×h screen plane showing `source`: "rain" (shared Matrix rain with the POI caption),
 * "image" or "video" (src resolved from the scene folder). Shows rain while loading.
 */
export function ScreenSurface({ source = 'rain', src, w, h, ...rest }) {
  const { rain } = useWorld();
  const media = useMediaTexture(source, src, w, h);
  return (
    <mesh {...rest}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={media || rain.texture} toneMapped={false} />
    </mesh>
  );
}
