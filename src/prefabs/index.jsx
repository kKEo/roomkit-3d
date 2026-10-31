import { Component, Suspense, lazy } from 'react';
import { ActionsContext, SlotContext, Solid } from '../scene/core.jsx';
import { useStore } from '../state/store.js';
import { BUILTIN_REGISTRY } from './registry.js';
import { LOADERS, loadComponent } from './loaders.js';
import { externalComponent } from './external.js';
import { toRad } from '../lib/math.js';

/** Built-in components, each loaded as its own chunk the first time it renders (or is preloaded). */
const COMPONENTS = Object.fromEntries(Object.keys(LOADERS).map(t => [t, lazy(() => loadComponent(t).then(c => ({ default: c })))]));

const NO_ACTIONS = {};

/** Stands in for an object whose code is still loading: a faint 1 m box on the floor. */
function Placeholder() {
  return <Solid fill={false} line="faint" args={[1, 1, 1]} position={[0, 0.5, 0]} />;
}

/**
 * Keeps one broken prefab (a chunk that failed to load, a scene prefab that throws while rendering)
 * from taking the whole canvas down: WebGLBoundary in App.jsx rethrows anything that is not a WebGL
 * failure. The object renders nothing and the error is logged once.
 */
class PrefabBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error(`Prefab "${this.props.type}" failed:`, error); }
  componentDidUpdate(prev) { if (prev.type !== this.props.type && this.state.failed) this.setState({ failed: false }); }
  render() { return this.state.failed ? null : this.props.children; }
}

/** A config object ({ type, position, rotation (deg), scale, props, actions }) placed in the world; `slot` is its index in the list. */
export function PlacedObject({ object, slot = null, active = false, hovered = false }) {
  const registry = useStore(s => s.scene?.registry) ?? BUILTIN_REGISTRY;
  const Component = COMPONENTS[object.type] ?? externalComponent(registry.get(object.type));
  return (
    <ActionsContext.Provider value={object.actions ?? NO_ACTIONS}>
      <SlotContext.Provider value={slot}>
        <group position={object.position} rotation={toRad(object.rotation)} scale={object.scale}>
          <PrefabBoundary type={object.type}>
            <Suspense fallback={<Placeholder />}>
              <Component props={object.props} active={active} hovered={hovered} />
            </Suspense>
          </PrefabBoundary>
        </group>
      </SlotContext.Provider>
    </ActionsContext.Provider>
  );
}
