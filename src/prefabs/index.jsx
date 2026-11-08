import { Component, Suspense, lazy, useCallback } from 'react';
import { ActionsContext, SlotContext, EditKeyContext, Solid } from '../scene/core.jsx';
import { useStore, editGroups } from '../state/store.js';
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

/**
 * A config object ({ type, position, rotation (deg), scale, props, actions }) placed in the world; `slot` is its index in the list.
 * `editKey` names it for the editor (src/editor/tree.js): hidden there, it is not drawn; in the editor's select mode a click
 * picks it, and a double-click frames it.
 */
export function PlacedObject({ object, slot = null, active = false, hovered = false, editKey = null }) {
  const registry = useStore(s => s.scene?.registry) ?? BUILTIN_REGISTRY;
  const hidden = useStore(s => editKey != null && !!s.edit?.hidden.has(editKey));
  const picking = useStore(s => editKey != null && s.edit?.mode === 'select');
  const track = useCallback(g => {
    if (editKey == null || !g) return;
    editGroups.set(editKey, g);
    // while the list is reordered another object may already hold the key
    return () => { if (editGroups.get(editKey) === g) editGroups.delete(editKey); };
  }, [editKey]);
  if (hidden) return null;
  const Component = COMPONENTS[object.type] ?? externalComponent(registry.get(object.type));
  return (
    <ActionsContext.Provider value={object.actions ?? NO_ACTIONS}>
      <SlotContext.Provider value={slot}>
        <EditKeyContext.Provider value={editKey}>
          <group ref={track} position={object.position} rotation={toRad(object.rotation)} scale={object.scale} {...(picking ? pickHandlers(editKey) : {})}>
            <PrefabBoundary type={object.type}>
              <Suspense fallback={<Placeholder />}>
                <Component props={object.props} active={active} hovered={hovered} />
              </Suspense>
            </PrefabBoundary>
          </group>
        </EditKeyContext.Provider>
      </SlotContext.Provider>
    </ActionsContext.Provider>
  );
}

/**
 * The editor's select mode: a locked object lets the pointer through to whatever is behind it, and so do lines (outlines,
 * a projector's beam), which three.js picks within a generous distance; only surfaces pick.
 */
function pickHandlers(key) {
  const st = useStore.getState;
  const open = e => e.object.isMesh && !e.object.isLineSegments2 && !st().edit?.locked.has(key) && (e.stopPropagation(), true);
  return {
    onClick: e => { if (e.delta < 8 && open(e)) st().setEdit({ selected: key }); },
    onDoubleClick: e => { if (open(e)) st().edit.frame?.(key); },
    onPointerOver: e => { if (open(e)) { st().setEdit({ hovered: key }); document.body.style.cursor = 'pointer'; } },
    onPointerOut: () => { if (st().edit?.hovered === key) st().setEdit({ hovered: null }); document.body.style.cursor = ''; },
  };
}
