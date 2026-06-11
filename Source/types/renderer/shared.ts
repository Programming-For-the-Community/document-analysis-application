import { THEME } from '../../constants/renderer/shared';
import { ENTITY_COLORS_DARK, EDGE_COLORS_DARK } from '../../constants/renderer/project/graph';

type EntityColorKey = keyof typeof ENTITY_COLORS_DARK; // Read keys from graph color maps into a type

type EdgeColorKeys = keyof typeof EDGE_COLORS_DARK; // Read keys from edge color maps into a type

export type EdgeColorMap = Record<EdgeColorKeys, string>; // Define a type for the edge color map using the keys from the edge color maps

export type EntityColorMap = Record<EntityColorKey, string>; // Define a type for the color map using the keys from the graph color maps

export type Theme = (typeof THEME)[keyof typeof THEME];
