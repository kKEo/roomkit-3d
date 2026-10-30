import { Pedestal } from './Pedestal.jsx';
import { PictureFrame } from './PictureFrame.jsx';
import { Wardrobe } from './Wardrobe.jsx';
import { CinemaScreen } from './CinemaScreen.jsx';
import { Desk } from './Desk.jsx';
import { ControlDesk } from './ControlDesk.jsx';
import { ServerRack } from './ServerRack.jsx';
import { Door, Bench, Primitive } from './simple.jsx';
import { ActionsContext } from '../scene/core.jsx';
import { toRad } from '../lib/math.js';

const COMPONENTS = {
  pedestal: Pedestal,
  pictureFrame: PictureFrame,
  wardrobe: Wardrobe,
  cinemaScreen: CinemaScreen,
  desk: Desk,
  controlDesk: ControlDesk,
  serverRack: ServerRack,
  door: Door,
  bench: Bench,
  primitive: Primitive,
};

const NO_ACTIONS = {};

/** A config object ({ type, position, rotation (deg), scale, props, actions }) placed in the world. */
export function PlacedObject({ object, active = false, hovered = false }) {
  const Component = COMPONENTS[object.type];
  return (
    <ActionsContext.Provider value={object.actions ?? NO_ACTIONS}>
      <group position={object.position} rotation={toRad(object.rotation)} scale={object.scale}>
        <Component props={object.props} active={active} hovered={hovered} />
      </group>
    </ActionsContext.Provider>
  );
}
